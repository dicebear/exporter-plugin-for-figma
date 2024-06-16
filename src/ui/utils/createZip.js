import JSZip from 'jszip';

export async function createZip(files) {
  const zip = new JSZip();

  for (let path in files) {
    if (false === files.hasOwnProperty(path)) {
      continue;
    }

    const file = files[path];

    zip.file(path, file.trim() + '\n', { binary: false });
  }

  return zip.generateAsync({ type: 'blob' });
}
