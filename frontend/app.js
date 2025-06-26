// API URL - Change this to match your backend URL
const API_URL = 'http://127.0.0.1:5000/api';

// DOM Elements
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const navLinks = document.querySelectorAll('.nav-link');
const sectionContents = document.querySelectorAll('.section-content');

// Student-related elements
const studentsTableBody = document.getElementById('studentsTableBody');
const addStudentBtn = document.getElementById('addStudentBtn');
const studentModal = new bootstrap.Modal(document.getElementById('studentModal'));
const studentForm = document.getElementById('studentForm');
const saveStudentBtn = document.getElementById('saveStudentBtn');

// Attendance-related elements
const attendanceBatchSelect = document.getElementById('attendanceBatch');
const attendanceDate = document.getElementById('attendanceDate');
const loadAttendanceBtn = document.getElementById('loadAttendanceBtn');
const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
const attendanceTableBody = document.getElementById('attendanceTableBody');

// Fees-related elements
const feesStudentSelect = document.getElementById('feesStudent');
const loadFeesBtn = document.getElementById('loadFeesBtn');
const feeDetailsSection = document.getElementById('feeDetails');
const totalFeeSpan = document.getElementById('totalFee');
const paidFeeSpan = document.getElementById('paidFee');
const balanceFeeSpan = document.getElementById('balanceFee');
const paymentsTableBody = document.getElementById('paymentsTableBody');
const addPaymentBtn = document.getElementById('addPaymentBtn');
const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
const paymentForm = document.getElementById('paymentForm');
const savePaymentBtn = document.getElementById('savePaymentBtn');

// Global state
let token = sessionStorage.getItem('token') || '';
let students = [];
let selectedStudentId = '';

// Set the default date to today
const today = new Date().toISOString().split('T')[0];
if (attendanceDate) attendanceDate.value = today;
if (document.getElementById('paymentDate')) document.getElementById('paymentDate').value = today;

// Check authentication status on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// Authentication Functions
function checkAuth() {
    if (token) {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        loadStudents();
        loadBatches();
    } else {
        loginSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
}

async function login(username, password) {
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        
        if (response.ok) {
            token = data.token;
            sessionStorage.setItem('token', token);
            checkAuth();
        } else {
            alert('Login failed: ' + data.message);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please check your connection and try again.');
    }
}

function logout() {
    token = '';
    selectedStudentId = '';
    sessionStorage.removeItem('token');
    checkAuth();
}

// Navigation Functions
function showSection(sectionId) {
    sectionContents.forEach(section => {
        section.classList.add('hidden');
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
    });
    
    document.getElementById(sectionId).classList.remove('hidden');
    document.querySelector(`.nav-link[data-section="${sectionId}"]`).classList.add('active');
}

// Student Management Functions
async function loadStudents() {
    try {
        const response = await fetch(`${API_URL}/students`, {
            headers: {
                'Authorization': token
            }
        });
        
        if (response.ok) {
            students = await response.json();
            renderStudentsTable();
            updateStudentDropdowns();
        } else {
            const data = await response.json();
            alert('Failed to load students: ' + data.message);
        }
    } catch (error) {
        console.error('Error loading students:', error);
        alert('Failed to load students. Please check your connection.');
    }
}

function renderStudentsTable() {
    studentsTableBody.innerHTML = '';
    
    if (students.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" class="text-center">No students registered</td>`;
        studentsTableBody.appendChild(row);
        return;
    }
    
    students.forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.name}</td>
            <td>${student.standard}</td>
            <td>${student.course}</td>
            <td>${student.batch}</td>
            <td>${student.guardianContact}</td>
            <td>
                <button class="btn btn-sm btn-primary edit-student" data-id="${student.id}">Edit</button>
                <button class="btn btn-sm btn-danger delete-student" data-id="${student.id}">Delete</button>
            </td>
        `;
        studentsTableBody.appendChild(row);
    });
    
    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit-student').forEach(button => {
        button.addEventListener('click', () => editStudent(button.dataset.id));
    });
    
    document.querySelectorAll('.delete-student').forEach(button => {
        button.addEventListener('click', () => deleteStudent(button.dataset.id));
    });
}

function updateStudentDropdowns() {
    // Update the student dropdown in the fees section
    feesStudentSelect.innerHTML = '<option value="">Select Student</option>';
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = `${student.name} (${student.batch})`;
        feesStudentSelect.appendChild(option);
    });
}

function openStudentModal(mode = 'add', studentId = null) {
    document.getElementById('studentModalTitle').textContent = mode === 'add' ? 'Add New Student' : 'Edit Student';
    document.getElementById('studentId').value = studentId || '';
    
    if (mode === 'edit' && studentId) {
        const student = students.find(s => s.id === studentId);
        if (student) {
            document.getElementById('studentName').value = student.name;
            document.getElementById('studentStandard').value = student.standard;
            document.getElementById('studentSchool').value = student.school;
            document.getElementById('studentCourse').value = student.course;
            document.getElementById('guardianName').value = student.guardianName;
            document.getElementById('guardianContact').value = student.guardianContact;
            document.getElementById('studentEmail').value = student.email;
            document.getElementById('studentBatch').value = student.batch;
        }
    } else {
        studentForm.reset();
    }
    
    studentModal.show();
}

function editStudent(studentId) {
    openStudentModal('edit', studentId);
}

async function saveStudent() {
    const studentId = document.getElementById('studentId').value;
    const studentData = {
        name: document.getElementById('studentName').value,
        standard: document.getElementById('studentStandard').value,
        school: document.getElementById('studentSchool').value,
        course: document.getElementById('studentCourse').value,
        guardianName: document.getElementById('guardianName').value,
        guardianContact: document.getElementById('guardianContact').value,
        email: document.getElementById('studentEmail').value,
        batch: document.getElementById('studentBatch').value
    };
    
    try {
        let response;
        if (studentId) {
            // Update existing student
            response = await fetch(`${API_URL}/students/${studentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token
                },
                body: JSON.stringify(studentData)
            });
        } else {
            // Add new student
            response = await fetch(`${API_URL}/students`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token
                },
                body: JSON.stringify(studentData)
            });
        }
        
        const data = await response.json();
        
        if (response.ok) {
            studentModal.hide();
            loadStudents();
            loadBatches();
            alert(studentId ? 'Student updated successfully' : 'Student added successfully');
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving student:', error);
        alert('Failed to save student. Please check your connection.');
    }
}

async function deleteStudent(studentId) {
    if (!confirm('Are you sure you want to delete this student?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/students/${studentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': token
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            loadStudents();
            alert('Student deleted successfully');
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting student:', error);
        alert('Failed to delete student. Please check your connection.');
    }
}

// Attendance Functions
async function loadBatches() {
    try {
        const response = await fetch(`${API_URL}/batches`, {
            headers: {
                'Authorization': token
            }
        });
        
        if (response.ok) {
            const batches = await response.json();
            
            // Update the batch dropdown in the attendance section
            attendanceBatchSelect.innerHTML = '<option value="">Select Batch</option>';
            batches.forEach(batch => {
                const option = document.createElement('option');
                option.value = batch;
                option.textContent = batch;
                attendanceBatchSelect.appendChild(option);
            });
        } else {
            const data = await response.json();
            console.error('Failed to load batches:', data.message);
        }
    } catch (error) {
        console.error('Error loading batches:', error);
    }
}

async function loadAttendanceStudents() {
    const batch = attendanceBatchSelect.value;
    const date = attendanceDate.value;
    
    if (!batch || !date) {
        alert('Please select both batch and date');
        return;
    }
    
    try {
        // Get students of the selected batch
        const batchStudents = students.filter(student => student.batch === batch);
        
        // Get existing attendance data for the selected date
        const response = await fetch(`${API_URL}/attendance/${batch}`, {
            headers: {
                'Authorization': token
            }
        });
        
        let attendanceData = {};
        if (response.ok) {
            const data = await response.json();
            attendanceData = data[date] || {};
        }
        
        // Render attendance table
        attendanceTableBody.innerHTML = '';
        
        if (batchStudents.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="3" class="text-center">No students in this batch</td>`;
            attendanceTableBody.appendChild(row);
            saveAttendanceBtn.disabled = true;
            return;
        }
        
        batchStudents.forEach(student => {
            const status = attendanceData[student.id] || 'present';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${student.name}</td>
                <td>${student.standard}</td>
                <td>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="attendance-${student.id}" 
                               id="present-${student.id}" value="present" ${status === 'present' ? 'checked' : ''}>
                        <label class="form-check-label" for="present-${student.id}">Present</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input" type="radio" name="attendance-${student.id}" 
                               id="absent-${student.id}" value="absent" ${status === 'absent' ? 'checked' : ''}>
                        <label class="form-check-label" for="absent-${student.id}">Absent</label>
                    </div>
                </td>
            `;
            attendanceTableBody.appendChild(row);
        });
        
        saveAttendanceBtn.disabled = false;
        
    } catch (error) {
        console.error('Error loading attendance:', error);
        alert('Failed to load attendance data. Please check your connection.');
    }
}

async function saveAttendance() {
    const batch = attendanceBatchSelect.value;
    const date = attendanceDate.value;
    
    if (!batch || !date) {
        alert('Please select both batch and date');
        return;
    }
    
    const attendanceData = {};
    const batchStudents = students.filter(student => student.batch === batch);
    
    batchStudents.forEach(student => {
        const presentRadio = document.getElementById(`present-${student.id}`);
        attendanceData[student.id] = presentRadio && presentRadio.checked ? 'present' : 'absent';
    });
    
    try {
        const response = await fetch(`${API_URL}/attendance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({
                date,
                batch,
                attendance: attendanceData
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Attendance saved successfully');
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving attendance:', error);
        alert('Failed to save attendance. Please check your connection.');
    }
}

// Fees Management Functions
async function loadStudentFees() {
    selectedStudentId = feesStudentSelect.value;
    
    if (!selectedStudentId) {
        alert('Please select a student');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/fees/${selectedStudentId}`, {
            headers: {
                'Authorization': token
            }
        });
        
        if (response.ok) {
            const feeInfo = await response.json();
            
            // Update fee summary
            totalFeeSpan.textContent = feeInfo.totalFee;
            paidFeeSpan.textContent = feeInfo.paid;
            balanceFeeSpan.textContent = feeInfo.balance;
            
            // Render payments table
            paymentsTableBody.innerHTML = '';
            
            if (feeInfo.installments.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="3" class="text-center">No payments recorded</td>`;
                paymentsTableBody.appendChild(row);
            } else {
                feeInfo.installments.forEach(payment => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${payment.date}</td>
                        <td>₹${payment.amount}</td>
                        <td>${payment.mode}</td>
                    `;
                    paymentsTableBody.appendChild(row);
                });
            }
            
            feeDetailsSection.classList.remove('hidden');
        } else {
            const data = await response.json();
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error loading fees:', error);
        alert('Failed to load fee details. Please check your connection.');
    }
}

function openPaymentModal() {
    if (!selectedStudentId) {
        alert('Please select a student first');
        return;
    }
    
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentMode').value = 'Cash';
    
    paymentModal.show();
}

async function savePayment() {
    if (!selectedStudentId) {
        alert('Please select a student first');
        return;
    }
    
    const paymentData = {
        date: document.getElementById('paymentDate').value,
        amount: parseFloat(document.getElementById('paymentAmount').value),
        mode: document.getElementById('paymentMode').value
    };
    
    if (!paymentData.date || isNaN(paymentData.amount) || paymentData.amount <= 0) {
        alert('Please enter valid payment details');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/fees/${selectedStudentId}/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify(paymentData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            paymentModal.hide();
            loadStudentFees();
            alert('Payment recorded successfully');
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving payment:', error);
        alert('Failed to save payment. Please check your connection.');
    }
}

// Event Listeners
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    login(username, password);
});

logoutBtn.addEventListener('click', logout);

navLinks.forEach(link => {
    link.addEventListener('click', function() {
        showSection(this.dataset.section);
    });
});

addStudentBtn.addEventListener('click', () => openStudentModal('add'));
saveStudentBtn.addEventListener('click', saveStudent);

loadAttendanceBtn.addEventListener('click', loadAttendanceStudents);
saveAttendanceBtn.addEventListener('click', saveAttendance);

loadFeesBtn.addEventListener('click', loadStudentFees);
addPaymentBtn.addEventListener('click', openPaymentModal);
savePaymentBtn.addEventListener('click', savePayment);
