import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

/**
 * 1. Admin User Onboarding & Temporary Password Generator
 * Handles secure employee registration on Auth & Firestore.
 */
export const adminCreateUser = functions.https.onCall(async (data, context) => {
  // Enforce caller security credentials (must be of ADMIN clearance)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'This action requires complete authentication.'
    );
  }

  const callerUid = context.auth.uid;
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const callerData = callerSnap.data();

  if (!callerData || (callerData.role !== 'ADMIN' && callerData.role !== 'superadmin')) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only system administrators can onboard new employees.'
    );
  }

  const { name, employeeId, email, contact, designation, role, password, departmentId } = data;

  if (!name || !employeeId || !email || !role || !password) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required parameters for employee registration.'
    );
  }

  const cleanEmployeeId = employeeId.trim().toUpperCase();

  // Validate that Employee ID is globally unique inside the organization register
  const duplicateIdSnap = await db.collection('users')
    .where('employeeId', '==', cleanEmployeeId)
    .limit(1)
    .get();

  if (!duplicateIdSnap.empty) {
    throw new functions.https.HttpsError(
      'already-exists',
      `An employee with Identity ID "${cleanEmployeeId}" already exists in the cockpit.`
    );
  }

  try {
    // 1. Create native Firebase Auth record mapped with email
    const authUser = await admin.auth().createUser({
      email: email.trim().toLowerCase(),
      password: password,
      displayName: name,
      disabled: false,
    });

    // 2. Set Custom Claims reflecting dynamic roles & visibility
    const roleSnap = await db.collection('roles').doc(role).get();
    const rolePermissions = roleSnap.data();
    const visibility = rolePermissions?.dataVisibility || 'Own';

    await admin.auth().setCustomUserClaims(authUser.uid, {
      role: role,
      visibility: visibility,
    });

    // 3. Write user document to Firestore users collection
    const newUserRecord = {
      id: authUser.uid,
      name: name,
      employeeId: cleanEmployeeId,
      email: email.trim().toLowerCase(),
      contact: contact || '',
      designation: designation || '',
      role: role,
      password: password, 
      mustChangePassword: true, // Forces rotation on first login
      status: 'Active',
      departmentId: departmentId || '',
      createdDate: new Date().toISOString(),
      reportingChain: [],
      subordinates: []
    };

    await db.collection('users').doc(authUser.uid).set(newUserRecord);

    return {
      success: true,
      uid: authUser.uid,
      employeeId: cleanEmployeeId,
      message: `Employee "${name}" has been registered.`
    };
  } catch (error: any) {
    console.error('Error onboarding user:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Onboarding failed.');
  }
});

/**
 * 2. Custom Employee ID Login Mapping (Resolves EmployeeId -> Auth -> Token)
 * Authenticates user by Employee ID and delivers a Secure Custom Token.
 */
export const employeeLoginMapping = functions.https.onCall(async (data, context) => {
  const { employeeId, password } = data;

  if (!employeeId || !password) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Both Employee ID and password credentials must be entered.'
    );
  }

  const cleanId = employeeId.trim().toUpperCase();

  try {
    // Search for user record matching Unique Employee ID
    const userQuery = await db.collection('users')
      .where('employeeId', '==', cleanId)
      .limit(1)
      .get();

    if (userQuery.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'Authentication failed: Employee ID does not exist in the registration indices.'
      );
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();

    if (userData.status !== 'Active') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Authentication failed: This employee account has been set to Inactive status.'
      );
    }

    // Verify Password match
    if (userData.password !== password) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Authentication failed: Invalid credentials.'
      );
    }

    // Fetch custom claims payload
    const roleSnap = await db.collection('roles').doc(userData.role).get();
    const rolePermissions = roleSnap.data();
    const visibility = rolePermissions?.dataVisibility || 'Own';

    // Issue custom authentication token for safe client bridging
    const customToken = await admin.auth().createCustomToken(userDoc.id, {
      role: userData.role,
      visibility: visibility,
      employeeId: cleanId,
      departmentId: userData.departmentId || ''
    });

    return {
      success: true,
      uid: userDoc.id,
      customToken: customToken,
      mustChangePassword: userData.mustChangePassword || false,
      user: {
        id: userDoc.id,
        name: userData.name,
        employeeId: cleanId,
        email: userData.email,
        role: userData.role,
        designation: userData.designation,
        status: userData.status,
        departmentId: userData.departmentId,
        mustChangePassword: userData.mustChangePassword || false
      }
    };
  } catch (error: any) {
    console.error('Login process fail:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Login routine failed.');
  }
});

/**
 * 3. Dynamic Custom Claims Modifier (Triggered on roles/hierarchy shifts)
 * Propagates updated authorization controls downstream dynamically.
 */
export const updateCustomClaimsOnHierarchyChange = functions.firestore
  .document('hierarchies/{departmentId}')
  .onWrite(async (change, context) => {
    const departmentId = context.params.departmentId;

    // Fetch updated dynamic hierarchy tree data
    const hierSnap = await db.collection('hierarchies').doc(departmentId).get();
    if (!hierSnap.exists) {
      console.log(`Hierarchy for department ${departmentId} deleted.`);
      return null;
    }

    const { layers } = hierSnap.data() as { layers: Array<{ roleId: string; employeeIds: string[] }> };
    if (!layers || layers.length === 0) return null;

    try {
      // Get all department users
      const usersSnap = await db.collection('users')
        .where('departmentId', '==', departmentId)
        .get();

      const deptUsers = usersSnap.docs.map(doc => doc.data());

      // Loop through users to reconstruct hierarchy reportingChain and subordinates cache
      for (const u of deptUsers) {
        const empId = u.employeeId;
        
        // Pin pointer where the employee is in the vertical layers list
        let myLayerIdx = -1;
        for (let i = 0; i < layers.length; i++) {
          if (layers[i].employeeIds.includes(empId)) {
            myLayerIdx = i;
            break;
          }
        }

        if (myLayerIdx === -1) continue; // Not assigned in the hierarchy layer yet

        // Supervisors reporting chain: anyone in layers above us (index 0 to myLayerIdx - 1)
        const reportingChain: string[] = [];
        for (let i = myLayerIdx - 1; i >= 0; i--) {
          reportingChain.push(...layers[i].employeeIds);
        }

        // Subordinates: anyone in layers directly beneath us (index myLayerIdx + 1 to end)
        const subordinates: string[] = [];
        for (let i = myLayerIdx + 1; i < layers.length; i++) {
          subordinates.push(...layers[i].employeeIds);
        }

        // Write the calculated arrays back into their users collection document to optimize queries
        await db.collection('users').doc(u.id).update({
          reportingChain: reportingChain,
          subordinates: subordinates
        });

        // Push immediate claims update to Firebase Auth Authentication records
        const roleSnap = await db.collection('roles').doc(u.role).get();
        const rolePermissions = roleSnap.data();
        const visibility = rolePermissions?.dataVisibility || 'Own';

        await admin.auth().setCustomUserClaims(u.id, {
          role: u.role,
          visibility: visibility,
          departmentId: departmentId,
          employeeId: empId
        });
      }

      console.log(`Dynamic hierarchy propagate complete for department: ${departmentId}`);
      return true;
    } catch (e) {
      console.error('Error updating claims on hierarchy shift:', e);
      return null;
    }
  });
