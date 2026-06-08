const express = require('express');
const router  = express.Router();

const { requireAuth, requirePermission, requireAnyPermission, requireAdmin } = require('../middleware/auth');
const upload = require('../config/multer');

const { login, logout, me, changePassword }                        = require('../controllers/authController');
const { listTags, createTag, deleteTag }                           = require('../controllers/tagController');
const { getTranscriptionStatus, retryTranscription }               = require('../controllers/transcriptionController');
const { getNotes, addNote, deleteNote }                            = require('../controllers/noteController');
const { listUsers, createUser, updateUser, deleteUser,
        resetPassword, getUserTags, setUserTags }                  = require('../controllers/userController');
const { listDepartments, createDepartment,
        updateDepartment, deleteDepartment }                       = require('../controllers/departmentController');
const { listExperiences, getExperience, createExperience,
        updateExperience, deleteExperience, streamFile,
        replaceFile }                                              = require('../controllers/experienceController');
const { listAttachments, addAttachment,
        streamAttachment, deleteAttachment }                       = require('../controllers/attachmentController');
const { getProviderInfo }                                          = require('../services/aiService');

// ─── Health / Info ────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'ok', ai: getProviderInfo() }));

// ─── Auth – Public ────────────────────────────────────────────────────────────
router.post('/auth/login', login);

// ─── Auth – Protected ─────────────────────────────────────────────────────────
router.post('/auth/logout',          requireAuth, logout);
router.get ('/auth/me',              requireAuth, me);
router.post('/auth/change-password', requireAuth, changePassword);

// ─── Users (admin only) ───────────────────────────────────────────────────────
router.get   ('/users',                       requireAuth, requireAdmin, listUsers);
router.post  ('/users',                       requireAuth, requireAdmin, createUser);
router.patch ('/users/:id',                   requireAuth, requireAdmin, updateUser);
router.delete('/users/:id',                   requireAuth, requireAdmin, deleteUser);
router.post  ('/users/:id/reset-password',    requireAuth, requireAdmin, resetPassword);
router.get   ('/users/:id/tags',              requireAuth, requireAdmin, getUserTags);
router.put   ('/users/:id/tags',              requireAuth, requireAdmin, setUserTags);

// ─── Departments ──────────────────────────────────────────────────────────────
router.get   ('/departments',     requireAuth,              listDepartments);
router.post  ('/departments',     requireAuth, requireAdmin, createDepartment);
router.patch ('/departments/:id', requireAuth, requireAdmin, updateDepartment);
router.delete('/departments/:id', requireAuth, requireAdmin, deleteDepartment);   

// ─── Tags ─────────────────────────────────────────────────────────────────────
router.get   ('/tags',     requireAuth, listTags);
router.post  ('/tags',     requireAuth, requirePermission('can_create_tags'), createTag);
router.delete('/tags/:id', requireAuth, requireAdmin, deleteTag);

// ─── Experiences ──────────────────────────────────────────────────────────────
router.get   ('/experiences',     requireAuth, listExperiences);
router.get   ('/experiences/:id', requireAuth, getExperience);
router.post  ('/experiences',     requireAuth, requireAnyPermission('can_upload', 'can_record'), upload.single('file'), createExperience);
router.patch ('/experiences/:id', requireAuth, updateExperience);
router.delete('/experiences/:id', requireAuth, deleteExperience);
router.get   ('/experiences/:id/file', requireAuth, streamFile);
router.put   ('/experiences/:id/file', requireAuth, requirePermission('can_upload'), upload.single('file'), replaceFile);

// ─── Experience Attachments ───────────────────────────────────────────────────
router.get   ('/experiences/:id/attachments',                    requireAuth, listAttachments);
router.post  ('/experiences/:id/attachments',                    requireAuth, requireAnyPermission('can_upload', 'can_record'), upload.single('file'), addAttachment);
router.get   ('/experiences/:id/attachments/:attachId/file',     requireAuth, streamAttachment);
router.delete('/experiences/:id/attachments/:attachId',          requireAuth, deleteAttachment);

// ─── Experience Notes ─────────────────────────────────────────────────────────
router.get   ('/experiences/:id/notes',            requireAuth, getNotes);
router.post  ('/experiences/:id/notes',            requireAuth, addNote);
router.delete('/experiences/:expId/notes/:noteId', requireAuth, deleteNote);

// ─── Transcription ────────────────────────────────────────────────────────────
router.get ('/transcription/:experienceId',       requireAuth, requirePermission('can_view_transcripts'), getTranscriptionStatus);
router.post('/transcription/:experienceId/retry', requireAuth, retryTranscription);

module.exports = router;
