// Presentation only. Stable artwork/album decoration never changes stored records.
export const themes=['checker','flower','wavy','doodle'];
export function visualIndex(id,count=4){let hash=0;for(const char of String(id))hash=(hash*31+char.charCodeAt(0))>>>0;return hash%count;}
export const albumTheme=id=>themes[visualIndex(id)];
export function decoration(kind, className=''){
  const illustrations={
    frame:'<rect x="22" y="17" width="76" height="85" rx="11" fill="var(--yellow)"/><rect x="31" y="26" width="58" height="67" rx="5" fill="var(--paper)"/><path d="m39 77 16-21 19 20H39Z" fill="var(--berry)"/><circle cx="72" cy="46" r="7" fill="var(--orange)"/>',
    heart:'<path d="M60 99 21 60C-2 30 34 8 60 38 83 8 121 30 100 60Z" fill="var(--pink)"/>',
    book:'<rect x="27" y="15" width="65" height="88" rx="8" fill="var(--blue)"/><path d="M42 15v88m11-32c4-17 17-17 27 0" fill="none" stroke="var(--focus)" stroke-width="4"/>',
    search:'<circle cx="48" cy="45" r="29" fill="var(--blue)" stroke="var(--focus)" stroke-width="5"/><path d="m70 68 28 32" fill="none" stroke="var(--focus)" stroke-width="10" stroke-linecap="round"/>'
  };
  return '<svg class="decoration '+className+'" viewBox="0 0 120 120" aria-hidden="true" focusable="false">'+(illustrations[kind]||illustrations.frame)+'</svg>';
}
