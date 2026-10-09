// Shrink a photo in the browser before upload: phone photos are 5–15 MB,
// and three of them would blow past the serverless request limit. Resized
// to at most 1600px on the long side and re-encoded as JPEG, each lands
// around 200–400 KB — plenty for foundation reports.

export function shrinkImage(file, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve({
          filename: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg',
          contentType: 'image/jpeg',
          data: dataUrl.split(',')[1],
          preview: dataUrl,
        });
      } catch (e) { reject(new Error('Could not read that photo.')); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file does not look like a photo.')); };
    img.src = url;
  });
}
