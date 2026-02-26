// Global variables
let currentUser = null;
let isAdmin = false;
let unsubscribeUserComplaints = null;
let unsubscribeAllComplaints = null;

// Navigation Functions
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick')?.includes(sectionId)) {
            link.classList.add('active');
        }
    });

    // Close mobile menu
    document.getElementById('navMenu').classList.remove('active');

    // Refresh data based on section
    if (sectionId === 'dashboard') {
        updatePublicDashboard();
    } else if (sectionId === 'userDashboard') {
        updateUserDashboard();
    } else if (sectionId === 'adminDashboard') {
        updateAdminDashboard();
    }
}

function toggleMenu() {
    document.getElementById('navMenu').classList.toggle('active');
}

// Update Public Dashboard
async function updatePublicDashboard() {
    const filter = document.getElementById('dashboardFilter').value;
    
    try {
        const complaintsRef = collection(window.db, 'complaints');
        const complaintsSnapshot = await getDocs(complaintsRef);
        const complaints = [];
        complaintsSnapshot.forEach(doc => {
            complaints.push({ id: doc.id, ...doc.data() });
        });

        // Filter complaints
        let filteredComplaints = [...complaints];
        if (filter !== 'all') {
            filteredComplaints = filteredComplaints.filter(c => c.status === filter);
        }

        // Update stats
        document.getElementById('dashboardTotalComplaints').textContent = complaints.length;
        document.getElementById('dashboardResolvedComplaints').textContent = 
            complaints.filter(c => c.status === 'resolved').length;
        document.getElementById('dashboardPendingComplaints').textContent = 
            complaints.filter(c => c.status === 'pending').length;
        
        const resolvedCount = complaints.filter(c => c.status === 'resolved').length;
        const resolutionRate = complaints.length > 0 
            ? Math.round((resolvedCount / complaints.length) * 100) 
            : 0;
        document.getElementById('dashboardResolutionRate').textContent = resolutionRate + '%';

        // Sort by date (newest first)
        filteredComplaints.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

        // Render complaints
        const complaintsList = document.getElementById('publicComplaintList');
        complaintsList.innerHTML = '';

        if (filteredComplaints.length === 0) {
            complaintsList.innerHTML = '<p class="no-data">No complaints found.</p>';
            return;
        }

        filteredComplaints.forEach(complaint => {
            const complaintCard = createPublicComplaintCard(complaint);
            complaintsList.appendChild(complaintCard);
        });
    } catch (error) {
        console.error('Error fetching complaints:', error);
        showToast('Error loading complaints', 'error');
    }
}

// Create Public Complaint Card
function createPublicComplaintCard(complaint) {
    const card = document.createElement('div');
    card.className = 'complaint-card';
    
    const statusClass = complaint.status === 'resolved' ? 'status-resolved' : 'status-pending';
    const urgencyClass = complaint.urgency === 'high' || complaint.urgency === 'critical' ? 'urgency-high' : '';
    
    const date = new Date(complaint.submittedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    card.innerHTML = `
        <div class="complaint-header">
            <span class="complaint-category">${complaint.category}</span>
            <span class="complaint-status ${statusClass}">${complaint.status}</span>
        </div>
        <p class="complaint-desc"><strong>Location:</strong> ${complaint.location}</p>
        <p class="complaint-desc">${complaint.description}</p>
        <div class="complaint-meta">
            <span><i class="fas fa-calendar"></i> ${date}</span>
            <span class="${urgencyClass}"><i class="fas fa-exclamation-triangle"></i> ${complaint.urgency}</span>
        </div>
    `;

    return card;
}

// User Registration
async function registerUser(e) {
    e.preventDefault();

    const name = document.getElementById('regFullName').value;
    const studentId = document.getElementById('regStudentId').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const department = document.getElementById('regDepartment').value;

    // Validation
    if (password !== confirmPassword) {
        showToast('Passwords do not match!', 'error');
        return;
    }

    try {
        showToast('Creating account...', 'info');
        
        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(window.auth, email, password);
        console.log('User created in Auth:', userCredential.user.uid);
        
        // Prepare user data
        const userData = {
            uid: userCredential.user.uid,
            name: name,
            studentId: studentId,
            email: email,
            department: department,
            isAdmin: false,
            registeredAt: new Date().toISOString()
        };
        
        console.log('Attempting to save user data:', userData);
        
        // Save to Firestore
        const docRef = await addDoc(collection(window.db, 'users'), userData);
        console.log('User saved to Firestore with ID:', docRef.id);

        showToast('Registration successful! Please login.', 'success');
        e.target.reset();
        
        // Sign out and redirect to login
        await signOut(window.auth);
        showSection('userLogin');
        
    } catch (error) {
        console.error('Registration error details:', error);
        
        // Handle specific Firebase errors
        if (error.code === 'permission-denied') {
            showToast('Firebase permission error. Please check Firestore rules.', 'error');
        } else if (error.code === 'auth/email-already-in-use') {
            showToast('Email already registered!', 'error');
        } else if (error.code === 'auth/weak-password') {
            showToast('Password should be at least 6 characters!', 'error');
        } else {
            showToast(error.message, 'error');
        }
    }
}

// User Login
async function loginUser(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        // Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(window.auth, email, password);
        
        // Get user data from Firestore
        const usersRef = collection(window.db, 'users');
        const userQuery = query(usersRef, where('uid', '==', userCredential.user.uid));
        const userSnapshot = await getDocs(userQuery);
        
        if (userSnapshot.empty) {
            showToast('User data not found!', 'error');
            await signOut(window.auth);
            return;
        }

        const userData = userSnapshot.docs[0].data();
        
        if (userData.isAdmin) {
            showToast('Please use admin login', 'error');
            await signOut(window.auth);
            return;
        }

        currentUser = {
            id: userSnapshot.docs[0].id,
            uid: userCredential.user.uid,
            ...userData
        };
        isAdmin = false;
        
        document.getElementById('userDisplayName').textContent = userData.name;
        document.getElementById('userDisplayInfo').textContent = 
            `${userData.studentId} - ${userData.department}`;
        
        showToast(`Welcome back, ${userData.name}!`, 'success');
        e.target.reset();
        showSection('userDashboard');
    } catch (error) {
        console.error('Login error:', error);
        showToast('Invalid email or password!', 'error');
    }
}

// Admin Login
async function loginAdmin(e) {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;

    try {
        // Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(window.auth, email, password);
        
        // Get user data from Firestore
        const usersRef = collection(window.db, 'users');
        const userQuery = query(usersRef, where('uid', '==', userCredential.user.uid));
        const userSnapshot = await getDocs(userQuery);
        
        if (userSnapshot.empty) {
            showToast('Admin data not found!', 'error');
            await signOut(window.auth);
            return;
        }

        const userData = userSnapshot.docs[0].data();
        
        if (!userData.isAdmin) {
            showToast('Not an admin account!', 'error');
            await signOut(window.auth);
            return;
        }

        isAdmin = true;
        currentUser = {
            id: userSnapshot.docs[0].id,
            uid: userCredential.user.uid,
            ...userData
        };
        
        showToast('Admin login successful!', 'success');
        e.target.reset();
        showSection('adminDashboard');
    } catch (error) {
        console.error('Admin login error:', error);
        showToast('Invalid admin credentials!', 'error');
    }
}

// Logout Functions
async function logoutUser() {
    try {
        await signOut(window.auth);
        currentUser = null;
        isAdmin = false;
        showToast('Logged out successfully!', 'info');
        showSection('home');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function logoutAdmin() {
    logoutUser();
}

// Submit Complaint
async function submitComplaint(e) {
    e.preventDefault();

    if (!currentUser) {
        showToast('Please login first!', 'error');
        showSection('userLogin');
        return;
    }

    const complaint = {
        category: document.getElementById('complaintCategory').value,
        location: document.getElementById('complaintLocation').value,
        description: document.getElementById('complaintDesc').value,
        urgency: document.getElementById('complaintUrgency').value,
        studentId: currentUser.studentId,
        studentName: currentUser.name,
        studentEmail: currentUser.email,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        userId: currentUser.uid
    };

    try {
        // Add complaint to Firestore
        await addDoc(collection(window.db, 'complaints'), complaint);
        
        showToast('Complaint submitted successfully!', 'success');
        e.target.reset();
        showSection('userDashboard');
    } catch (error) {
        console.error('Error submitting complaint:', error);
        showToast('Error submitting complaint', 'error');
    }
}

// Update User Dashboard with real-time listener
function updateUserDashboard() {
    if (!currentUser) return;

    // Clean up previous listener
    if (unsubscribeUserComplaints) {
        unsubscribeUserComplaints();
    }

    // Set up real-time listener for user's complaints
    const complaintsRef = collection(window.db, 'complaints');
    const userComplaintsQuery = query(
        complaintsRef, 
        where('userId', '==', currentUser.uid),
        orderBy('submittedAt', 'desc')
    );

    unsubscribeUserComplaints = onSnapshot(userComplaintsQuery, (snapshot) => {
        const userComplaints = [];
        snapshot.forEach(doc => {
            userComplaints.push({ id: doc.id, ...doc.data() });
        });

        const resolvedComplaints = userComplaints.filter(c => c.status === 'resolved');
        
        // Update stats
        document.getElementById('totalUserComplaints').textContent = userComplaints.length;
        document.getElementById('resolvedUserComplaints').textContent = resolvedComplaints.length;
        document.getElementById('pendingUserComplaints').textContent = 
            userComplaints.filter(c => c.status === 'pending').length;
        
        const resolutionRate = userComplaints.length > 0 
            ? Math.round((resolvedComplaints.length / userComplaints.length) * 100) 
            : 0;
        document.getElementById('resolutionRate').textContent = resolutionRate + '%';

        // Render complaints list
        const complaintsList = document.getElementById('userComplaintList');
        complaintsList.innerHTML = '';

        if (userComplaints.length === 0) {
            complaintsList.innerHTML = '<p class="no-data">No complaints submitted yet.</p>';
            return;
        }

        userComplaints.forEach(complaint => {
            const complaintCard = createComplaintCard(complaint, false);
            complaintsList.appendChild(complaintCard);
        });
    }, (error) => {
        console.error('Error fetching user complaints:', error);
        showToast('Error loading complaints', 'error');
    });
}

// Update Admin Dashboard with real-time listener
function updateAdminDashboard() {
    // Clean up previous listener
    if (unsubscribeAllComplaints) {
        unsubscribeAllComplaints();
    }

    // Set up real-time listener for all complaints
    const complaintsRef = collection(window.db, 'complaints');
    const allComplaintsQuery = query(complaintsRef, orderBy('submittedAt', 'desc'));

    unsubscribeAllComplaints = onSnapshot(allComplaintsQuery, async (snapshot) => {
        const complaints = [];
        snapshot.forEach(doc => {
            complaints.push({ id: doc.id, ...doc.data() });
        });

        // Get user count
        const usersSnapshot = await getDocs(collection(window.db, 'users'));
        const userCount = usersSnapshot.size;

        // Update stats
        document.getElementById('totalComplaints').textContent = complaints.length;
        document.getElementById('resolvedComplaints').textContent = 
            complaints.filter(c => c.status === 'resolved').length;
        document.getElementById('pendingComplaints').textContent = 
            complaints.filter(c => c.status === 'pending').length;
        document.getElementById('activeUsers').textContent = userCount;

        // Store complaints globally for filtering
        window.allComplaints = complaints;
        filterComplaints();
    }, (error) => {
        console.error('Error fetching all complaints:', error);
        showToast('Error loading complaints', 'error');
    });
}

// Filter Complaints (Admin)
function filterComplaints() {
    const statusFilter = document.getElementById('complaintFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;

    if (!window.allComplaints) return;

    let filteredComplaints = [...window.allComplaints];

    if (statusFilter !== 'all') {
        filteredComplaints = filteredComplaints.filter(c => c.status === statusFilter);
    }

    if (categoryFilter !== 'all') {
        filteredComplaints = filteredComplaints.filter(c => c.category === categoryFilter);
    }

    const complaintsList = document.getElementById('adminComplaintList');
    complaintsList.innerHTML = '';

    if (filteredComplaints.length === 0) {
        complaintsList.innerHTML = '<p class="no-data">No complaints found.</p>';
        return;
    }

    filteredComplaints.forEach(complaint => {
        const complaintCard = createComplaintCard(complaint, true);
        complaintsList.appendChild(complaintCard);
    });
}

// Create Complaint Card
function createComplaintCard(complaint, isAdmin) {
    const card = document.createElement('div');
    card.className = 'complaint-card';
    
    const statusClass = complaint.status === 'resolved' ? 'status-resolved' : 'status-pending';
    const urgencyClass = complaint.urgency === 'high' || complaint.urgency === 'critical' ? 'urgency-high' : '';
    
    const date = new Date(complaint.submittedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    card.innerHTML = `
        <div class="complaint-header">
            <span class="complaint-category">${complaint.category}</span>
            <span class="complaint-status ${statusClass}">${complaint.status}</span>
        </div>
        <p class="complaint-desc"><strong>Location:</strong> ${complaint.location}</p>
        <p class="complaint-desc">${complaint.description}</p>
        <div class="complaint-meta">
            <span><i class="fas fa-user"></i> ${complaint.studentName}</span>
            <span><i class="fas fa-id-card"></i> ${complaint.studentId}</span>
            <span><i class="fas fa-calendar"></i> ${date}</span>
            <span class="${urgencyClass}"><i class="fas fa-exclamation-triangle"></i> ${complaint.urgency}</span>
        </div>
        ${isAdmin && complaint.status === 'pending' ? 
            `<button class="btn-primary" onclick="markResolved('${complaint.id}')">
                <i class="fas fa-check"></i> Mark Resolved
            </button>` : ''}
    `;

    return card;
}

// Mark Complaint as Resolved (Admin)
async function markResolved(complaintId) {
    try {
        const complaintRef = doc(window.db, 'complaints', complaintId);
        await updateDoc(complaintRef, {
            status: 'resolved',
            resolvedAt: new Date().toISOString(),
            resolvedBy: currentUser?.uid || 'admin'
        });
        
        showToast('Complaint marked as resolved!', 'success');
    } catch (error) {
        console.error('Error marking complaint as resolved:', error);
        showToast('Error updating complaint', 'error');
    }
}

// Show Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 
                         type === 'error' ? 'fa-exclamation-circle' : 
                         'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Set up auth state listener
    onAuthStateChanged(window.auth, async (user) => {
        if (user) {
            // User is signed in
            try {
                const usersRef = collection(window.db, 'users');
                const userQuery = query(usersRef, where('uid', '==', user.uid));
                const userSnapshot = await getDocs(userQuery);
                
                if (!userSnapshot.empty) {
                    const userData = userSnapshot.docs[0].data();
                    currentUser = {
                        id: userSnapshot.docs[0].id,
                        uid: user.uid,
                        ...userData
                    };
                    isAdmin = userData.isAdmin || false;

                    if (isAdmin) {
                        showSection('adminDashboard');
                    } else {
                        document.getElementById('userDisplayName').textContent = userData.name;
                        document.getElementById('userDisplayInfo').textContent = 
                            `${userData.studentId} - ${userData.department}`;
                        showSection('userDashboard');
                    }
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        } else {
            // User is signed out
            currentUser = null;
            isAdmin = false;
            
            // Clean up listeners
            if (unsubscribeUserComplaints) {
                unsubscribeUserComplaints();
                unsubscribeUserComplaints = null;
            }
            if (unsubscribeAllComplaints) {
                unsubscribeAllComplaints();
                unsubscribeAllComplaints = null;
            }
        }
    });

    // Add click outside to close mobile menu
    document.addEventListener('click', (e) => {
        const navMenu = document.getElementById('navMenu');
        const hamburger = document.querySelector('.hamburger');
        
        if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) {
            navMenu.classList.remove('active');
        }
    });
});

// TEMPORARY FUNCTION - Add this to script.js and run once
async function createAdminUser() {
    try {
        // Create admin in Authentication
        const userCredential = await createUserWithEmailAndPassword(
            window.auth, 
            'admin@campus.edu', 
            'admin123'
        );
        
        // Create admin document in Firestore
        await addDoc(collection(window.db, 'users'), {
            uid: userCredential.user.uid,
            name: 'Admin',
            email: 'admin@campus.edu',
            studentId: 'ADMIN001',
            department: 'Administration',
            isAdmin: true,
            registeredAt: new Date().toISOString()
        });
        
        console.log('Admin created successfully!');
        showToast('Admin created! You can now login.', 'success');
    } catch (error) {
        console.error('Error creating admin:', error);
        if (error.code === 'auth/email-already-in-use') {
            showToast('Admin already exists! Linking to Firestore...', 'info');
            await linkExistingAdmin();
        }
    }
}

// Helper function to link existing auth user to Firestore
async function linkExistingAdmin() {
    try {
        // Sign in to get the user
        const userCredential = await signInWithEmailAndPassword(
            window.auth,
            'admin@campus.edu',
            'admin123'
        );
        
        // Check if document exists
        const usersRef = collection(window.db, 'users');
        const q = query(usersRef, where('uid', '==', userCredential.user.uid));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            // Create document for existing auth user
            await addDoc(collection(window.db, 'users'), {
                uid: userCredential.user.uid,
                name: 'Admin',
                email: 'admin@campus.edu',
                studentId: 'ADMIN001',
                department: 'Administration',
                isAdmin: true,
                registeredAt: new Date().toISOString()
            });
            console.log('Admin document created for existing auth user');
            showToast('Admin document created! Please login again.', 'success');
        }
        
        await signOut(window.auth);
    } catch (error) {
        console.error('Error linking admin:', error);
    }
}

// Call this function from browser console:
// createAdminUser()