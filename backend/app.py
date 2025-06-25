# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import uuid
import datetime
import pandas as pd
from azure.storage.blob import BlobServiceClient
import json
from functools import wraps
import ast
from io import BytesIO

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize Azure Blob Storage
blob_service_client = None
try:
    if os.environ.get('AZURE_STORAGE_CONNECTION_STRING'):
        print(os.environ.get('AZURE_STORAGE_CONNECTION_STRING'))
        blob_service_client = BlobServiceClient.from_connection_string(os.environ.get('AZURE_STORAGE_CONNECTION_STRING'))
except Exception as e:
    print(f"Azure storage initialization error: {e}")

# In-memory data storage for development (replace with Azure in production)
# In production, these would be initialized from Azure blob storage
students_data = []
attendance_data = []  # Changed from dict to list for tabular format
fees_data = []        # Changed from dict to list for tabular format
fee_payments_data = [] # New table for fee payments (installments)

# Course fee structure
COURSE_FEES = {
    "CBSE": 30000,
    "CBSE+JEE": 45000,
    "CBSE+NEET": 45000,
    "JEE Only": 35000,
    "NEET Only": 35000
}

# Token verification decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        
        if token != f"Bearer {os.environ.get('SECRET_KEY')}":
            return jsonify({'message': 'Invalid token!'}), 401
            
        return f(*args, **kwargs)
    return decorated

# Helper Functions for Azure Storage
def upload_excel_to_azure(data, file_name):
    if not blob_service_client:
        print("Azure storage not configured, skipping upload")
        return
    
    try:
        # Create container if it doesn't exist
        try:
            container_client = blob_service_client.get_container_client(os.environ.get('CONTAINER_NAME'))
            if not container_client.exists():
                container_client = blob_service_client.create_container(os.environ.get('CONTAINER_NAME'))
        except Exception as e:
            print(f"Container creation error: {e}")
            container_client = blob_service_client.create_container(os.environ.get('CONTAINER_NAME'))
        
        # Convert data to Excel and upload
        df = pd.DataFrame(data)
        df.to_excel(file_name, index=False)
        with open(file_name, "rb") as data:
            blob_client = container_client.get_blob_client(file_name)
            blob_client.upload_blob(data, overwrite=True)
        print(f"Successfully uploaded {file_name} to Azure")
    except Exception as e:
        print(f"Error uploading to Azure: {e}")

def download_excel_from_azure(file_name):
    if not blob_service_client:
        print("Azure storage not configured, skipping download")
        return None
    
    try:
        container_client = blob_service_client.get_container_client(os.environ.get('CONTAINER_NAME'))
        blob_client = container_client.get_blob_client(file_name)
        if not blob_client.exists():
            return None
            
        downloaded_blob = blob_client.download_blob()
        df = pd.read_excel(BytesIO(downloaded_blob.readall()))
        return df.to_dict('records')
    except Exception as e:
        print(f"Error downloading from Azure: {e}")
        return None

# Routes
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if username == os.environ.get('ADMIN_USERNAME') and password == os.environ.get('ADMIN_PASSWORD'):
        return jsonify({
            'message': 'Login successful',
            'token': f"Bearer {os.environ.get('SECRET_KEY')}"
        })
    else:
        return jsonify({'message': 'Invalid credentials'}), 401

@app.route('/api/students', methods=['GET'])
@token_required
def get_students():
    # Try to load from Azure first
    azure_data = download_excel_from_azure('students.xlsx')
    if azure_data:
        return jsonify(azure_data)
    return jsonify(students_data)

@app.route('/api/students', methods=['POST'])
@token_required
def register_student():
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['name', 'standard', 'school', 'course', 'guardianName', 
                      'guardianContact', 'email', 'batch']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Missing required field: {field}'}), 400
    
    # Add student ID and registration date
    student_id = str(uuid.uuid4())
    registration_date = datetime.datetime.now().strftime("%Y-%m-%d")
    
    new_student = {
        'id': student_id,
        'name': data['name'],
        'standard': data['standard'],
        'school': data['school'],
        'course': data['course'],
        'guardianName': data['guardianName'],
        'guardianContact': data['guardianContact'],
        'email': data['email'],
        'batch': data['batch'],
        'registrationDate': registration_date
    }
    students_data = download_excel_from_azure('students.xlsx')
    fees_data = download_excel_from_azure('fees.xlsx')

    students_data.append(new_student)
    
    # Initialize fee record for this student
    course_fee = COURSE_FEES.get(data['course'], 30000)
    new_fee_record = {
        'studentId': student_id,
        'studentName': data['name'],
        'course': data['course'],
        'totalFee': course_fee,
        'paid': 0,
        'balance': course_fee
    }
    fees_data.append(new_fee_record)
    
    # Upload updated data to Azure
    upload_excel_to_azure(students_data, 'students.xlsx')
    upload_excel_to_azure(fees_data, 'fees.xlsx')
    
    return jsonify({
        'message': 'Student registered successfully',
        'student': new_student
    })

@app.route('/api/students/<student_id>', methods=['PUT'])
@token_required
def update_student(student_id):
    data = request.get_json()
    
    for i, student in enumerate(students_data):
        if student['id'] == student_id:
            # Update student data while preserving id and registration date
            students_data[i] = {
                'id': student_id,
                'registrationDate': student['registrationDate'],
                'name': data.get('name', student['name']),
                'standard': data.get('standard', student['standard']),
                'school': data.get('school', student['school']),
                'course': data.get('course', student['course']),
                'guardianName': data.get('guardianName', student['guardianName']),
                'guardianContact': data.get('guardianContact', student['guardianContact']),
                'email': data.get('email', student['email']),
                'batch': data.get('batch', student['batch'])
            }
            
            # Update fee structure if course changed
            if data.get('course') and data['course'] != student['course']:
                new_course_fee = COURSE_FEES.get(data['course'], 30000)
                
                # Find student fee record
                for j, fee_record in enumerate(fees_data):
                    if fee_record['studentId'] == student_id:
                        paid_amount = fee_record['paid']
                        fees_data[j] = {
                            'studentId': student_id,
                            'studentName': data.get('name', student['name']),
                            'course': data['course'],
                            'totalFee': new_course_fee,
                            'paid': paid_amount,
                            'balance': new_course_fee - paid_amount
                        }
                        break
            
            # Upload updated data to Azure
            upload_excel_to_azure(students_data, 'students.xlsx')
            upload_excel_to_azure(fees_data, 'fees.xlsx')
            
            return jsonify({
                'message': 'Student updated successfully',
                'student': students_data[i]
            })
    
    return jsonify({'message': 'Student not found'}), 404

@app.route('/api/students/<student_id>', methods=['DELETE'])
@token_required
def delete_student(student_id):
    students_data = download_excel_from_azure('students.xlsx')
    fees_data = download_excel_from_azure('fees.xlsx')
    fee_payments_data = download_excel_from_azure('fee_payments.xlsx')
    attendance_data = download_excel_from_azure('attendance.xlsx')
    for i, student in enumerate(students_data):
        if student['id'] == student_id:
            del students_data[i]
            
            # Delete fee records
            fees_data[:] = [fee for fee in fees_data if fee['studentId'] != student_id]
            
            # Delete fee payment records
            fee_payments_data[:] = [payment for payment in fee_payments_data if payment['studentId'] != student_id]
            
            # Delete attendance records
            attendance_data[:] = [record for record in attendance_data if record['studentId'] != student_id]
            
            # print(students_data)
            # print(fees_data)
            # print(fee_payments_data)
            # print(attendance_data)
            # Upload updated data to Azure
            upload_excel_to_azure(students_data, 'students.xlsx')
            upload_excel_to_azure(fees_data, 'fees.xlsx')
            upload_excel_to_azure(fee_payments_data, 'fee_payments.xlsx')
            upload_excel_to_azure(attendance_data, 'attendance.xlsx')
            
            return jsonify({'message': 'Student deleted successfully'})
    
    return jsonify({'message': 'Student not found'}), 404

@app.route('/api/batches', methods=['GET'])
@token_required
def get_batches():
    batches = set()
    students_data = download_excel_from_azure('students.xlsx')
    for student in students_data:
        batches.add(student['batch'])
    print(list(batches))
    return jsonify(list(batches))

@app.route('/api/attendance', methods=['POST'])
@token_required
def mark_attendance():
    data = request.get_json()
    date = data.get('date')
    batch = data.get('batch')
    attendance_records = data.get('attendance', {})
    attendance_data = download_excel_from_azure('attendance.xlsx')
    if not date or not batch or not attendance_records:
        return jsonify({'message': 'Missing required fields'}), 400
    
    # Update attendance for each student
    for student_id, status in attendance_records.items():
        # Check if a record already exists for this student on this date
        existing_record = next((record for record in attendance_data 
                                if record['studentId'] == student_id and record['date'] == date), None)
        
        if existing_record:
            # Update existing record
            for record in attendance_data:
                if record['studentId'] == student_id and record['date'] == date:
                    record['status'] = status
                    break
        else:
            # Create new attendance record
            student = next((s for s in students_data if s['id'] == student_id), None)
            if student:
                new_record = {
                    'studentId': student_id,
                    'studentName': student['name'],
                    'date': date,
                    'batch': batch,
                    'status': status
                }
                attendance_data.append(new_record)
    
    # Upload updated data to Azure
    upload_excel_to_azure(attendance_data, 'attendance.xlsx')
    
    return jsonify({'message': 'Attendance marked successfully'})

@app.route('/api/attendance/<batch>', methods=['GET'])
@token_required
def get_attendance(batch):
    # Get students in this batch
    students_data = download_excel_from_azure('students.xlsx')
    batch_students = [s for s in students_data if s['batch'] == batch]
    
    # Filter attendance data for this batch
    batch_attendance = [record for record in attendance_data if record['batch'] == batch]
    
    # Group by date for easier frontend processing
    result = {}
    for record in batch_attendance:
        date = record['date']
        if date not in result:
            result[date] = {}
        
        result[date][record['studentId']] = record['status']
    
    # Fill in missing students with 'Not Marked'
    for date in result:
        for student in batch_students:
            student_id = student['id']
            if student_id not in result[date]:
                result[date][student_id] = 'Not Marked'
    
    return jsonify(result)

@app.route('/api/fees/<student_id>', methods=['GET'])
@token_required
def get_student_fees(student_id):
    # Find fee record for student
    fees_data = download_excel_from_azure('fees.xlsx')
    fee_payments_data = download_excel_from_azure('fee_payments.xlsx')
    fee_record = next((fee for fee in fees_data if fee['studentId'] == student_id), None)
    if not fee_record:
        return jsonify({'message': 'Student fee record not found'}), 404
    
    # Get installment records for this student
    installments = [payment for payment in fee_payments_data if payment['studentId'] == student_id]
    
    # Combine data for response
    result = {
        **fee_record,
        'installments': installments
    }
    
    return jsonify(result)

@app.route('/api/fees/<student_id>/pay', methods=['POST'])
@token_required
def record_fee_payment(student_id):
    # Find fee record for student
    fees_data = download_excel_from_azure('fees.xlsx')
    fee_payments_data = download_excel_from_azure('fee_payments.xlsx')
    fee_record = next((fee for i, fee in enumerate(fees_data) if fee['studentId'] == student_id), None)
    fee_index = next((i for i, fee in enumerate(fees_data) if fee['studentId'] == student_id), -1)
    
    if fee_record is None or fee_index == -1:
        return jsonify({'message': 'Student fee record not found'}), 404
    
    data = request.get_json()
    amount = data.get('amount', 0)
    payment_date = data.get('date', datetime.datetime.now().strftime("%Y-%m-%d"))
    payment_mode = data.get('mode', 'Cash')
    
    if amount <= 0:
        return jsonify({'message': 'Invalid payment amount'}), 400
    
    # Check if payment exceeds balance
    if amount > fee_record['balance']:
        return jsonify({'message': 'Payment amount exceeds balance'}), 400
    
    # Record payment
    payment_id = str(uuid.uuid4())
    new_payment = {
        'id': payment_id,
        'studentId': student_id,
        'studentName': fee_record['studentName'],
        'date': payment_date,
        'amount': amount,
        'mode': payment_mode
    }
    
    fee_payments_data.append(new_payment)
    
    # Update fee record
    fees_data[fee_index]['paid'] += amount
    fees_data[fee_index]['balance'] -= amount
    
    # Upload updated data to Azure
    upload_excel_to_azure(fees_data, 'fees.xlsx')
    upload_excel_to_azure(fee_payments_data, 'fee_payments.xlsx')
    
    # Get all installments for response
    installments = [payment for payment in fee_payments_data if payment['studentId'] == student_id]
    
    updated_fee_info = {
        **fees_data[fee_index],
        'installments': installments
    }
    
    return jsonify({
        'message': 'Payment recorded successfully',
        'payment': new_payment,
        'updatedFeeInfo': updated_fee_info
    })

# Initialize data from Azure on startup
def initialize_data():
    global students_data, attendance_data, fees_data, fee_payments_data
    
    azure_students = download_excel_from_azure('students.xlsx')
    if azure_students:
        students_data = azure_students
    
    azure_fees = download_excel_from_azure('fees.xlsx')
    if azure_fees:
        fees_data = azure_fees
    
    azure_attendance = download_excel_from_azure('attendance.xlsx')
    if azure_attendance:
        attendance_data = azure_attendance
        
    azure_fee_payments = download_excel_from_azure('fee_payments.xlsx')
    if azure_fee_payments:
        fee_payments_data = azure_fee_payments

if __name__ == '__main__':
    initialize_data()
    app.run(debug=False, host='0.0.0.0', port=5000)