// Plain names for kinds of file, the app that opens them, and whether Well Good Mail ever opens them itself.

/** Kinds of file that run as programs: never opened straight from an email. Kept in step with NEVER_OPEN in src-tauri/src/files.rs. */
const NEVER_OPEN = new Set([
  'exe', 'com', 'bat', 'cmd', 'scr', 'pif', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'msp', 'cpl', 'msc', 'jar',
  'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ws', 'hta', 'ps1', 'psm1', 'psd1', 'ps1xml', 'lnk', 'url', 'reg', 'inf', 'scf',
  'application', 'gadget', 'dll', 'sys', 'iso', 'img', 'vhd', 'vhdx', 'xll', 'library-ms', 'settingcontent-ms', 'chm', 'diagcab',
]);

const KINDS: [RegExp, string, string?][] = [
  [/^docx?$|^docm$|^dotx?$|^rtf$/, 'Word document', 'Word'],
  [/^xlsx?$|^xlsm$|^xltx?$/, 'Excel spreadsheet', 'Excel'],
  [/^pptx?$|^pptm$|^ppsx?$/, 'PowerPoint presentation', 'PowerPoint'],
  [/^pages$/, 'Pages document'],
  [/^numbers$/, 'Numbers spreadsheet'],
  [/^key$/, 'Keynote presentation'],
  [/^odt$/, 'OpenDocument text'],
  [/^ods$/, 'OpenDocument spreadsheet'],
  [/^zip$|^7z$|^rar$/, 'Compressed folder'],
  [/^eml$|^msg$/, 'Email'],
  [/^vcf$/, 'Contact card'],
  [/^psd$/, 'Photoshop file', 'Photoshop'],
  [/^ai$/, 'Illustrator file', 'Illustrator'],
  [/^heic$|^tiff?$|^svg$/, 'Picture'],
  [/^mov$|^mp4$|^m4v$|^avi$|^mkv$/, 'Video'],
  [/^mp3$|^wav$|^m4a$|^aac$|^flac$/, 'Sound'],
];

export const extOf = (filename: string) => (filename.match(/\.([A-Za-z0-9-]{1,20})$/)?.[1] || '').toLowerCase();

export function describeFile(filename: string): { kind: string; app?: string; blocked: boolean } {
  const ext = extOf(filename);
  if (NEVER_OPEN.has(ext)) return { kind: 'Program or script', blocked: true };
  for (const [re, kind, app] of KINDS) if (re.test(ext)) return { kind, app, blocked: false };
  return { kind: ext ? `${ext.toUpperCase()} file` : 'File', blocked: false };
}

/** Word documents the app can show itself (the newer .docx kind; older .doc files open in Word). */
export const isDocx = (filename: string, mimeType: string) =>
  extOf(filename) === 'docx' || /wordprocessingml\.document$/i.test(mimeType);
