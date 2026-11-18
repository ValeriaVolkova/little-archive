export function storageErrorKey(error){
  if(error?.name==='QuotaExceededError')return 'saveQuota';
  if(/Draft changed/.test(error?.message||''))return 'saveDraftConflict';
  if(/Archive changed/.test(error?.message||''))return 'saveArchiveConflict';
  if(['SecurityError','NotAllowedError'].includes(error?.name))return 'savePermission';
  if(['DataCloneError','UnknownError','NotReadableError'].includes(error?.name))return 'saveImageStorage';
  if(/Invalid|Unsafe|Unsupported/.test(error?.message||''))return 'saveInvalid';
  return 'saveError';
}
