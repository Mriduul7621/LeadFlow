import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { getPool, initializeDatabase } from './server/db.ts';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Lazy Database Initializer Middleware for Serverless Compatibility
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
    } catch (err) {
      console.error('⚠️ Database initialization failed:', err);
    }
  }
  next();
});

  // ==========================================
  // Neon PostgreSQL API REST Routes (CRUD)
  // ==========================================

  // Check if database is connected
  app.get('/api/db-status', (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.json({ connected: false, message: 'DATABASE_URL is not set.' });
    }
    res.json({ connected: true, message: 'Connected to Neon PostgreSQL.' });
  });

  // --- USERS CRUD ---
  // Check if an ADMIN user exists in the database
  app.get('/api/users/check-admin', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ exists: false });
    try {
      const result = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'");
      const count = parseInt(result.rows[0].count, 10);
      res.json({ exists: count > 0 });
    } catch (err: any) {
      console.error('Error checking admin presence:', err);
      res.status(500).json({ error: 'Database check failed', details: err.message });
    }
  });

  // Get all users
  app.get('/api/users', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query('SELECT * FROM users');
      const formatted = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        employeeId: row.employee_id,
        email: row.email,
        role: row.role,
        designation: row.designation,
        status: row.status,
        createdDate: row.created_date,
        password: row.password,
        teamId: row.team_id || ''
      }));
      res.json(formatted);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Database fetch failed', details: err.message });
    }
  });

  // Create or update user
  app.post('/api/users', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const { id, name, employeeId, email, role, designation, status, createdDate, password } = req.body;
      const query = `
        INSERT INTO users (id, name, employee_id, email, role, designation, status, created_date, password)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          employee_id = EXCLUDED.employee_id,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          designation = EXCLUDED.designation,
          status = EXCLUDED.status,
          created_date = EXCLUDED.created_date,
          password = EXCLUDED.password
        RETURNING *
      `;
      const values = [id, name, employeeId, email, role, designation, status, createdDate, password];
      await pool.query(query, values);
      res.status(200).json(req.body);
    } catch (err: any) {
      console.error('Error upserting user:', err);
      res.status(500).json({ error: 'Upsert failed', details: err.message });
    }
  });

  // Sync users list
  app.post('/api/users/sync', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true, processed: 0 });
    try {
      const { localUsers, deletedUserIds } = req.body;
      let syncCount = 0;

      if (Array.isArray(deletedUserIds) && deletedUserIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1)', [deletedUserIds]);
      }

      if (Array.isArray(localUsers)) {
        for (const user of localUsers) {
          const { id, name, employeeId, email, role, designation, status, createdDate, password } = user;
          const query = `
            INSERT INTO users (id, name, employee_id, email, role, designation, status, created_date, password)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              employee_id = EXCLUDED.employee_id,
              email = EXCLUDED.email,
              role = EXCLUDED.role,
              designation = EXCLUDED.designation,
              status = EXCLUDED.status,
              created_date = EXCLUDED.created_date,
              password = EXCLUDED.password
          `;
          await pool.query(query, [id, name, employeeId, email, role, designation, status, createdDate, password]);
          syncCount++;
        }
      }

      const latestUsers = await pool.query('SELECT * FROM users');
      const formatted = latestUsers.rows.map(row => ({
        id: row.id,
        name: row.name,
        employeeId: row.employee_id,
        email: row.email,
        role: row.role,
        designation: row.designation,
        status: row.status,
        createdDate: row.created_date,
        password: row.password,
        teamId: row.team_id || ''
      }));
      res.json({ success: true, processed: syncCount, cloudUsers: formatted });
    } catch (err: any) {
      console.error('Users sync failed:', err);
      res.status(500).json({ error: 'Users sync failed', details: err.message });
    }
  });

  // Delete user
  app.delete('/api/users/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Delete user failed:', err);
      res.status(500).json({ error: 'Delete failed', details: err.message });
    }
  });


  // --- LEADS CRUD ---
  // Get all leads
  app.get('/api/leads', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query('SELECT * FROM leads ORDER BY timestamp DESC');
      const formatted = result.rows.map(row => {
        let history = [];
        try {
          history = row.status_history ? JSON.parse(row.status_history) : [];
        } catch (e) {
          history = [];
        }
        return {
          id: row.id,
          prospectName: row.prospect_name,
          mobileNumber: row.mobile_number,
          campaignName: row.campaign_name,
          currentStatus: row.current_status,
          collectedNCP: row.collected_ncp ? Number(row.collected_ncp) : 0,
          projectedNCP: row.projected_ncp ? Number(row.projected_ncp) : 0,
          sumAssured: row.sum_assured ? Number(row.sum_assured) : 0,
          productName: row.product_name,
          assignedTo: row.assigned_to,
          assignedBy: row.assigned_by,
          assignedDate: row.assigned_date,
          creationDate: row.creation_date,
          lastFollowUpDate: row.last_follow_up_date,
          nextFollowUpDate: row.next_follow_up_date,
          nextCallDate: row.next_call_date,
          meetingDate: row.meeting_date,
          priority: row.priority,
          district: row.district,
          upazila: row.upazila,
          address: row.address,
          statusHistory: history,
          timestamp: row.timestamp || row.creation_date
        };
      });
      res.json(formatted);
    } catch (err: any) {
      console.error('Error fetching leads:', err);
      res.status(500).json({ error: 'Database fetch failed', details: err.message });
    }
  });

  // Create / Update lead (Upsert)
  app.post('/api/leads', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const lead = req.body;
      const statusHistoryJson = JSON.stringify(lead.statusHistory || []);
      const query = `
        INSERT INTO leads (
          id, prospect_name, mobile_number, campaign_name, current_status,
          collected_ncp, projected_ncp, sum_assured, product_name,
          assigned_to, assigned_by, assigned_date, creation_date,
          last_follow_up_date, next_follow_up_date, next_call_date, meeting_date,
          priority, district, upazila, address, status_history, timestamp
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (id) DO UPDATE SET
          prospect_name = EXCLUDED.prospect_name,
          mobile_number = EXCLUDED.mobile_number,
          campaign_name = EXCLUDED.campaign_name,
          current_status = EXCLUDED.current_status,
          collected_ncp = EXCLUDED.collected_ncp,
          projected_ncp = EXCLUDED.projected_ncp,
          sum_assured = EXCLUDED.sum_assured,
          product_name = EXCLUDED.product_name,
          assigned_to = EXCLUDED.assigned_to,
          assigned_by = EXCLUDED.assigned_by,
          assigned_date = EXCLUDED.assigned_date,
          creation_date = EXCLUDED.creation_date,
          last_follow_up_date = EXCLUDED.last_follow_up_date,
          next_follow_up_date = EXCLUDED.next_follow_up_date,
          next_call_date = EXCLUDED.next_call_date,
          meeting_date = EXCLUDED.meeting_date,
          priority = EXCLUDED.priority,
          district = EXCLUDED.district,
          upazila = EXCLUDED.upazila,
          address = EXCLUDED.address,
          status_history = EXCLUDED.status_history,
          timestamp = EXCLUDED.timestamp
        RETURNING *
      `;
      const values = [
        lead.id, lead.prospectName, lead.mobileNumber, lead.campaignName, lead.currentStatus,
        lead.collectedNCP || 0, lead.projectedNCP || 0, lead.sumAssured || 0, lead.productName || '',
        lead.assignedTo || '', lead.assignedBy || '', lead.assignedDate || '', lead.creationDate || '',
        lead.lastFollowUpDate || '', lead.nextFollowUpDate || '', lead.nextCallDate || '', lead.meetingDate || '',
        lead.priority || '', lead.district || '', lead.upazila || '', lead.address || '',
        statusHistoryJson, lead.timestamp || new Date().toISOString()
      ];
      await pool.query(query, values);
      res.json({ success: true, lead });
    } catch (err: any) {
      console.error('Error upserting lead:', err);
      res.status(500).json({ error: 'Upsert failed', details: err.message });
    }
  });

  // Bidirectional Leads sync
  app.post('/api/leads/sync', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true, processed: 0 });
    try {
      const { localLeads, deletedLeadIds } = req.body;
      let syncCount = 0;

      if (Array.isArray(deletedLeadIds) && deletedLeadIds.length > 0) {
        await pool.query('DELETE FROM leads WHERE id = ANY($1)', [deletedLeadIds]);
      }

      if (Array.isArray(localLeads)) {
        for (const lead of localLeads) {
          const statusHistoryJson = JSON.stringify(lead.statusHistory || []);
          const query = `
            INSERT INTO leads (
              id, prospect_name, mobile_number, campaign_name, current_status,
              collected_ncp, projected_ncp, sum_assured, product_name,
              assigned_to, assigned_by, assigned_date, creation_date,
              last_follow_up_date, next_follow_up_date, next_call_date, meeting_date,
              priority, district, upazila, address, status_history, timestamp
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
            )
            ON CONFLICT (id) DO UPDATE SET
              prospect_name = EXCLUDED.prospect_name,
              mobile_number = EXCLUDED.mobile_number,
              campaign_name = EXCLUDED.campaign_name,
              current_status = EXCLUDED.current_status,
              collected_ncp = EXCLUDED.collected_ncp,
              projected_ncp = EXCLUDED.projected_ncp,
              sum_assured = EXCLUDED.sum_assured,
              product_name = EXCLUDED.product_name,
              assigned_to = EXCLUDED.assigned_to,
              assigned_by = EXCLUDED.assigned_by,
              assigned_date = EXCLUDED.assigned_date,
              creation_date = EXCLUDED.creation_date,
              last_follow_up_date = EXCLUDED.last_follow_up_date,
              next_follow_up_date = EXCLUDED.next_follow_up_date,
              next_call_date = EXCLUDED.next_call_date,
              meeting_date = EXCLUDED.meeting_date,
              priority = EXCLUDED.priority,
              district = EXCLUDED.district,
              upazila = EXCLUDED.upazila,
              address = EXCLUDED.address,
              status_history = EXCLUDED.status_history,
              timestamp = EXCLUDED.timestamp
          `;
          const values = [
            lead.id, lead.prospectName, lead.mobileNumber, lead.campaignName, lead.currentStatus,
            lead.collectedNCP || 0, lead.projectedNCP || 0, lead.sumAssured || 0, lead.productName || '',
            lead.assignedTo || '', lead.assignedBy || '', lead.assignedDate || '', lead.creationDate || '',
            lead.lastFollowUpDate || '', lead.nextFollowUpDate || '', lead.nextCallDate || '', lead.meetingDate || '',
            lead.priority || '', lead.district || '', lead.upazila || '', lead.address || '',
            statusHistoryJson, lead.timestamp || new Date().toISOString()
          ];
          await pool.query(query, values);
          syncCount++;
        }
      }

      const result = await pool.query('SELECT * FROM leads ORDER BY timestamp DESC');
      const formatted = result.rows.map(row => {
        let history = [];
        try {
          history = row.status_history ? JSON.parse(row.status_history) : [];
        } catch (e) {
          history = [];
        }
        return {
          id: row.id,
          prospectName: row.prospect_name,
          mobileNumber: row.mobile_number,
          campaignName: row.campaign_name,
          currentStatus: row.current_status,
          collectedNCP: row.collected_ncp ? Number(row.collected_ncp) : 0,
          projectedNCP: row.projected_ncp ? Number(row.projected_ncp) : 0,
          sumAssured: row.sum_assured ? Number(row.sum_assured) : 0,
          productName: row.product_name,
          assignedTo: row.assigned_to,
          assignedBy: row.assigned_by,
          assignedDate: row.assigned_date,
          creationDate: row.creation_date,
          lastFollowUpDate: row.last_follow_up_date,
          nextFollowUpDate: row.next_follow_up_date,
          nextCallDate: row.next_call_date,
          meetingDate: row.meeting_date,
          priority: row.priority,
          district: row.district,
          upazila: row.upazila,
          address: row.address,
          statusHistory: history,
          timestamp: row.timestamp || row.creation_date
        };
      });

      res.json({ success: true, processed: syncCount, cloudLeads: formatted });
    } catch (err: any) {
      console.error('Leads sync failed:', err);
      res.status(500).json({ error: 'Leads sync failure', details: err.message });
    }
  });

  // Delete lead
  app.delete('/api/leads/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('DELETE FROM leads WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Delete lead failed:', err);
      res.status(500).json({ error: 'Delete failed', details: err.message });
    }
  });

  // Delete campaign leads
  app.delete('/api/leads/campaign/:campaignName', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true, count: 0 });
    try {
      const result = await pool.query('DELETE FROM leads WHERE LOWER(TRIM(campaign_name)) = LOWER(TRIM($1))', [req.params.campaignName]);
      res.json({ success: true, count: result.rowCount });
    } catch (err: any) {
      console.error('Delete campaign leads failed:', err);
      res.status(500).json({ error: 'Delete failure', details: err.message });
    }
  });

  // Clear all leads
  app.post('/api/leads/clear-all', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('DELETE FROM leads');
      res.json({ success: true });
    } catch (err: any) {
      console.error('Clear leads failed:', err);
      res.status(500).json({ error: 'Clear failed', details: err.message });
    }
  });


  // --- OPTIONS CRUD ---
  // Get all options
  app.get('/api/options', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query('SELECT * FROM options');
      res.json(result.rows);
    } catch (err: any) {
      console.error('Error fetching options:', err);
      res.status(500).json({ error: 'Fetch failed', details: err.message });
    }
  });

  // Add / Update option
  app.post('/api/options', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const { type, value, status } = req.body;
      const id = `${type}_${value.trim().replace(/\s+/g, '_')}`;
      const query = `
        INSERT INTO options (id, type, value, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          value = EXCLUDED.value,
          status = EXCLUDED.status
        RETURNING *
      `;
      const result = await pool.query(query, [id, type, value, status || 'Active']);
      res.json(result.rows[0]);
    } catch (err: any) {
      console.error('Add option failed:', err);
      res.status(500).json({ error: 'Add failure', details: err.message });
    }
  });

  // Options sync
  app.post('/api/options/sync', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true, processed: 0 });
    try {
      const { localOptions, deletedOptionIds } = req.body;
      let syncCount = 0;

      if (Array.isArray(deletedOptionIds) && deletedOptionIds.length > 0) {
        await pool.query('DELETE FROM options WHERE id = ANY($1)', [deletedOptionIds]);
      }

      if (Array.isArray(localOptions)) {
        for (const opt of localOptions) {
          const { id, type, value, status } = opt;
          const query = `
            INSERT INTO options (id, type, value, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
              type = EXCLUDED.type,
              value = EXCLUDED.value,
              status = EXCLUDED.status
          `;
          await pool.query(query, [id, type, value, status || 'Active']);
          syncCount++;
        }
      }

      const latest = await pool.query('SELECT * FROM options');
      res.json({ success: true, processed: syncCount, cloudOptions: latest.rows });
    } catch (err: any) {
      console.error('Options sync failed:', err);
      res.status(500).json({ error: 'Options sync failed', details: err.message });
    }
  });

  // Delete option
  app.delete('/api/options/:type/:value', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      const { type, value } = req.params;
      const id = `${type}_${value.trim().replace(/\s+/g, '_')}`;
      await pool.query('DELETE FROM options WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Delete option failed:', err);
      res.status(500).json({ error: 'Delete option failed', details: err.message });
    }
  });


  // --- DEPARTMENTS CRUD ---
  // Get departments
  app.get('/api/departments', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query('SELECT * FROM departments');
      const formatted = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        createdDate: row.created_date
      }));
      res.json(formatted);
    } catch (err) {
      console.error('Error fetching departments:', err);
      res.json([]);
    }
  });

  // Save/Upsert department
  app.post('/api/departments', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const { id, name, createdDate } = req.body;
      const query = `
        INSERT INTO departments (id, name, created_date)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          created_date = EXCLUDED.created_date
      `;
      await pool.query(query, [id, name, createdDate]);
      res.json(req.body);
    } catch (err) {
      console.error('Error saving department:', err);
      res.status(500).json({ error: 'Save failed' });
    }
  });

  // Delete department
  app.delete('/api/departments/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting department:', err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });


  // --- HIERARCHIES CRUD ---
  // Get hierarchies
  app.get('/api/hierarchies', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query('SELECT * FROM hierarchies');
      const formatted = result.rows.map(row => {
        let layers = [];
        try {
          layers = row.layers ? JSON.parse(row.layers) : [];
        } catch (e) {
          layers = [];
        }
        return {
          id: row.id,
          departmentId: row.department_id,
          layers,
          updatedAt: row.updated_at
        };
      });
      res.json(formatted);
    } catch (err) {
      console.error('Error fetching hierarchies:', err);
      res.json([]);
    }
  });

  // Save hierarchy
  app.post('/api/hierarchies', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const { id, departmentId, layers, updatedAt } = req.body;
      const layersJson = JSON.stringify(layers || []);
      const query = `
        INSERT INTO hierarchies (id, department_id, layers, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          department_id = EXCLUDED.department_id,
          layers = EXCLUDED.layers,
          updated_at = EXCLUDED.updated_at
      `;
      await pool.query(query, [id, departmentId, layersJson, updatedAt]);
      res.json(req.body);
    } catch (err) {
      console.error('Error saving hierarchy:', err);
      res.status(500).json({ error: 'Save failed' });
    }
  });


  // --- ROLES/PERMISSIONS CRUD ---
  // Get all roles
  app.get('/api/roles', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query('SELECT * FROM roles');
      const formatted = result.rows.map(row => {
        let menuAccess = {};
        let actions = {};
        let featurePermissions = {};
        try {
          menuAccess = row.menu_access ? JSON.parse(row.menu_access) : {};
        } catch (e) {}
        try {
          actions = row.actions ? JSON.parse(row.actions) : {};
        } catch (e) {}
        try {
          featurePermissions = row.feature_permissions ? JSON.parse(row.feature_permissions) : {};
        } catch (e) {}
        return {
          roleId: row.role_id,
          roleName: row.role_name,
          menuAccess,
          dataVisibility: row.data_visibility,
          actions,
          featurePermissions
        };
      });
      res.json(formatted);
    } catch (err) {
      console.error('Error fetching roles:', err);
      res.json([]);
    }
  });

  // Save/Upsert role
  app.post('/api/roles', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const { roleId, roleName, menuAccess, dataVisibility, actions, featurePermissions } = req.body;
      const menuAccessJson = JSON.stringify(menuAccess || {});
      const actionsJson = JSON.stringify(actions || {});
      const featurePermissionsJson = JSON.stringify(featurePermissions || {});
      const query = `
        INSERT INTO roles (role_id, role_name, menu_access, data_visibility, actions, feature_permissions)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (role_id) DO UPDATE SET
          role_name = EXCLUDED.role_name,
          menu_access = EXCLUDED.menu_access,
          data_visibility = EXCLUDED.data_visibility,
          actions = EXCLUDED.actions,
          feature_permissions = EXCLUDED.feature_permissions
      `;
      await pool.query(query, [roleId, roleName, menuAccessJson, dataVisibility, actionsJson, featurePermissionsJson]);
      res.json(req.body);
    } catch (err) {
      console.error('Error saving role:', err);
      res.status(500).json({ error: 'Save failed' });
    }
  });

  // Delete role
  app.delete('/api/roles/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('DELETE FROM roles WHERE role_id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting role:', err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });


  // --- TEAMS CRUD ---
  // Get all teams
  app.get('/api/teams', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query('SELECT * FROM teams');
      const formatted = result.rows.map(row => {
        let memberIds = [];
        try {
          memberIds = row.member_ids ? JSON.parse(row.member_ids) : [];
        } catch (e) {}
        return {
          id: row.id,
          name: row.name,
          leaderId: row.leader_id,
          leaderName: row.leader_name,
          memberIds,
          createdDate: row.created_date,
          departmentId: row.department_id
        };
      });
      res.json(formatted);
    } catch (err) {
      console.error('Error fetching teams:', err);
      res.json([]);
    }
  });

  // Save/Upsert team
  app.post('/api/teams', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const { id, name, leaderId, leaderName, memberIds, createdDate, departmentId } = req.body;
      const memberIdsJson = JSON.stringify(memberIds || []);
      const query = `
        INSERT INTO teams (id, name, leader_id, leader_name, member_ids, created_date, department_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          leader_id = EXCLUDED.leader_id,
          leader_name = EXCLUDED.leader_name,
          member_ids = EXCLUDED.member_ids,
          created_date = EXCLUDED.created_date,
          department_id = EXCLUDED.department_id
      `;
      await pool.query(query, [id, name, leaderId, leaderName, memberIdsJson, createdDate, departmentId]);
      res.json(req.body);
    } catch (err) {
      console.error('Error saving team:', err);
      res.status(500).json({ error: 'Save failed' });
    }
  });

  // Delete team
  app.delete('/api/teams/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting team:', err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });


  // --- NOTIFICATIONS CRUD ---
  // Get all notifications for a specific user
  app.get('/api/notifications/users/:userId', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json([]);
    try {
      const result = await pool.query(
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY date DESC', 
        [req.params.userId]
      );
      const formatted = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        message: row.message,
        leadId: row.lead_id,
        read: row.read,
        date: row.date
      }));
      res.json(formatted);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.json([]);
    }
  });

  // Create notifications
  app.post('/api/notifications', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json(req.body);
    try {
      const { id, userId, title, message, leadId, read, date } = req.body;
      const query = `
        INSERT INTO notifications (id, user_id, title, message, lead_id, read, date)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          title = EXCLUDED.title,
          message = EXCLUDED.message,
          lead_id = EXCLUDED.lead_id,
          read = EXCLUDED.read,
          date = EXCLUDED.date
      `;
      await pool.query(query, [id, userId, title, message, leadId, read || false, date]);
      res.json(req.body);
    } catch (err) {
      console.error('Error creating notification:', err);
      res.status(500).json({ error: 'Create failed' });
    }
  });

  // Mark specific notification as read
  app.post('/api/notifications/:id/read', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('UPDATE notifications SET read = TRUE WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
      res.status(500).json({ error: 'Operation failed' });
    }
  });

  // Mark all notifications for user as read
  app.post('/api/notifications/users/:userId/read-all', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [req.params.userId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error marking all notifications read:', err);
      res.status(500).json({ error: 'Operation failed' });
    }
  });

  // Delete all notifications for user
  app.delete('/api/notifications/users/:userId', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.json({ success: true });
    try {
      await pool.query('DELETE FROM notifications WHERE user_id = $1', [req.params.userId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting user notifications:', err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });


  // ==========================================
  // Vite HMR and Single-Page Application (SPA) Serving
  // ==========================================
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    }).then((vite) => {
      app.use(vite.middlewares);
      console.log('⚡ Vite development middleware applied.');
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Full-Stack application running on http://0.0.0.0:${PORT}`);
      });
    }).catch((err) => {
      console.error('Failed to create Vite server:', err);
    });
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Full-Stack application running on http://0.0.0.0:${PORT}`);
    });
  }

export default app;
