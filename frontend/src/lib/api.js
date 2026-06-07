// ─── Base URL ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// ─── Header Builders ──────────────────────────────────────────────────────────
const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const authHeaders = (token) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

// ─── Response Handler ─────────────────────────────────────────────────────────
const handleResponse = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// ─── Core HTTP Methods ────────────────────────────────────────────────────────
export const apiGet = (path, token) =>
  fetch(`${BASE_URL}${path}`, { headers: jsonHeaders(token) }).then(handleResponse);

export const apiPost = (path, body, token) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(body),
  }).then(handleResponse);

export const apiPatch = (path, body, token) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify(body),
  }).then(handleResponse);

export const apiPut = (path, body, token) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify(body),
  }).then(handleResponse);

export const apiDelete = (path, token) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'DELETE', headers: jsonHeaders(token),
  }).then(handleResponse);

// ─── File Upload (multipart) ──────────────────────────────────────────────────
export const apiUpload = (path, formData, token) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'POST', headers: authHeaders(token), body: formData,
  }).then(handleResponse);

// ─── Authenticated File Download (fetch + Blob URL) ───────────────────────────
export const downloadFile = async (path, filename, token) => {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const blob    = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor  = document.createElement('a');
  anchor.href = blobUrl; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(blobUrl);
};

// ─── Audio / File Stream URL ──────────────────────────────────────────────────
export const getFileStreamUrl = (experienceId) =>
  `${BASE_URL}/experiences/${experienceId}/file`;

// ─── Admin: Users ─────────────────────────────────────────────────────────────
export const adminGetUsers    = (token)             => apiGet('/users', token);
export const adminCreateUser  = (body, token)       => apiPost('/users', body, token);
export const adminUpdateUser  = (id, body, token)   => apiPatch(`/users/${id}`, body, token);
export const adminDeleteUser  = (id, token)         => apiDelete(`/users/${id}`, token);
export const adminResetPwd    = (id, body, token)   => apiPost(`/users/${id}/reset-password`, body, token);

// ─── Admin: Departments ───────────────────────────────────────────────────────
export const getDepartments      = (token)           => apiGet('/departments', token);
export const adminCreateDept     = (body, token)     => apiPost('/departments', body, token);
export const adminUpdateDept     = (id, body, token) => apiPatch(`/departments/${id}`, body, token);
export const adminDeleteDept     = (id, token)       => apiDelete(`/departments/${id}`, token);

// ─── Admin: Tags ──────────────────────────────────────────────────────────────
export const adminCreateTag   = (body, token)            => apiPost('/tags', body, token);
export const adminDeleteTag   = (id, token)              => apiDelete(`/tags/${id}`, token);
export const adminSetUserTags = (userId, tagIds, token)  => apiPut(`/users/${userId}/tags`, { tag_ids: tagIds }, token);

// ─── Experience File ──────────────────────────────────────────────────────────
export const replaceExperienceFile = (id, file, token) => {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`${BASE_URL}/experiences/${id}/file`, {
    method: 'PUT', headers: authHeaders(token), body: fd,
  }).then(handleResponse);
};

// ─── Experience Notes ─────────────────────────────────────────────────────────
export const getNotes    = (expId, token)          => apiGet(`/experiences/${expId}/notes`, token);
export const addNote     = (expId, body, token)    => apiPost(`/experiences/${expId}/notes`, body, token);
export const deleteNote  = (expId, noteId, token)  => apiDelete(`/experiences/${expId}/notes/${noteId}`, token);

// ─── Experience Attachments ───────────────────────────────────────────────────
export const getAttachments    = (expId, token)            => apiGet(`/experiences/${expId}/attachments`, token);
export const deleteAttachment  = (expId, attachId, token)  => apiDelete(`/experiences/${expId}/attachments/${attachId}`, token);
export const getAttachmentUrl  = (expId, attachId)         => `${BASE_URL}/experiences/${expId}/attachments/${attachId}/file`;

export const addAttachment = (expId, file, token) => {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`${BASE_URL}/experiences/${expId}/attachments`, {
    method: 'POST', headers: authHeaders(token), body: fd,
  }).then(handleResponse);
};
