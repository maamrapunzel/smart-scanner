/**
 * SMART Scanner Sync Relay
 * Google Apps Script Web App
 *
 * Deploy as:
 *  - Execute as: Me
 *  - Who has access: Anyone with the link (or equivalent option available to your account)
 *
 * The relay stores temporary JSON packages in a private Google Drive folder.
 * Each package expires automatically and can be consumed/deleted by the phone.
 */

const SMART_SYNC = {
  FOLDER_NAME: 'SMART_SCANNER_SYNC_TEMP',
  FILE_PREFIX: 'SYNC_',
  TTL_HOURS: 12
};

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || 'ping').toLowerCase();
  const callback = String(p.callback || '').trim();

  let out;
  try {
    if (action === 'ping') {
      out = { ok: true, service: 'SMART Scanner Sync', version: 1 };
    } else if (action === 'get') {
      out = getSyncPackage_(String(p.code || '').trim());
    } else {
      out = { ok: false, error: 'Unknown action.' };
    }
  } catch (err) {
    out = { ok: false, error: err && err.message ? err.message : String(err) };
  }

  return output_(out, callback);
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return output_({ ok: false, error: 'Invalid JSON request.' });
  }

  const action = String(body.action || '').toLowerCase();

  try {
    if (action === 'put') {
      return output_(putSyncPackage_(String(body.code || '').trim(), body.payload));
    }
    if (action === 'consume') {
      return output_(consumeSyncPackage_(String(body.code || '').trim()));
    }
    if (action === 'cleanup') {
      return output_({ ok: true, deleted: cleanupExpired_() });
    }
    return output_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return output_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function putSyncPackage_(code, payload) {
  validateCode_(code);
  if (!payload || typeof payload !== 'object') throw new Error('Missing sync payload.');

  cleanupExpired_();

  const folder = syncFolder_();
  const fileName = SMART_SYNC.FILE_PREFIX + code.toUpperCase() + '.json';

  const old = filesByName_(folder, fileName);
  old.forEach(function(file) { file.setTrashed(true); });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SMART_SYNC.TTL_HOURS * 60 * 60 * 1000);

  const envelope = {
    service: 'SMART Scanner Sync',
    version: 1,
    code: code.toUpperCase(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    payload: payload
  };

  folder.createFile(
    Utilities.newBlob(
      JSON.stringify(envelope),
      'application/json',
      fileName
    )
  );

  return {
    ok: true,
    code: code.toUpperCase(),
    expiresAt: expiresAt.toISOString()
  };
}

function getSyncPackage_(code) {
  validateCode_(code);
  cleanupExpired_();

  const folder = syncFolder_();
  const fileName = SMART_SYNC.FILE_PREFIX + code.toUpperCase() + '.json';
  const files = filesByName_(folder, fileName);

  if (!files.length) {
    return { ok: false, error: 'Sync code not found or already expired.' };
  }

  const file = files[0];
  const envelope = JSON.parse(file.getBlob().getDataAsString('UTF-8'));

  if (!envelope.expiresAt || new Date(envelope.expiresAt).getTime() < Date.now()) {
    file.setTrashed(true);
    return { ok: false, error: 'Sync code has expired.' };
  }

  return {
    ok: true,
    code: envelope.code,
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt,
    payload: envelope.payload
  };
}

function consumeSyncPackage_(code) {
  validateCode_(code);
  const folder = syncFolder_();
  const fileName = SMART_SYNC.FILE_PREFIX + code.toUpperCase() + '.json';
  const files = filesByName_(folder, fileName);
  files.forEach(function(file) { file.setTrashed(true); });
  return { ok: true, deleted: files.length };
}

function cleanupExpired_() {
  const folder = syncFolder_();
  const files = folder.getFiles();
  let deleted = 0;

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf(SMART_SYNC.FILE_PREFIX) !== 0) continue;

    let expired = false;
    try {
      const envelope = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
      expired = !envelope.expiresAt || new Date(envelope.expiresAt).getTime() < Date.now();
    } catch (err) {
      expired = true;
    }

    if (expired) {
      file.setTrashed(true);
      deleted++;
    }
  }

  return deleted;
}

function syncFolder_() {
  const it = DriveApp.getFoldersByName(SMART_SYNC.FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(SMART_SYNC.FOLDER_NAME);
}

function filesByName_(folder, name) {
  const arr = [];
  const it = folder.getFilesByName(name);
  while (it.hasNext()) arr.push(it.next());
  return arr;
}

function validateCode_(code) {
  const c = String(code || '').toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(c)) {
    throw new Error('Invalid sync code.');
  }
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);

  if (callback && /^[A-Za-z_$][A-Za-z0-9_$\.]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
