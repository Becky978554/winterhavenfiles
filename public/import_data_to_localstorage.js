// Fetch /data/sheep.json and import into browser localStorage in the app's expected format
(async function () {
  try {
    const res = await fetch('/data/sheep.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch /data/sheep.json: ' + res.status);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('Expected an array in data/sheep.json');

    const imported = [];
    for (const raw of arr) {
      try {
        if (!raw) continue;
        // Raw file may contain ids like "sheep-123". The app expects objects with `id` (no prefix)
        let id = raw.id || raw._id || '';
        if (typeof id === 'string' && id.indexOf('sheep-') === 0) id = id.slice(6);
        if (!id) id = (raw.tag || raw.name || Math.random().toString(36).slice(2, 9));
        const copy = Object.assign({}, raw, { id: id });
        // Save under key `sheep-<id>`
        localStorage.setItem('sheep-' + id, JSON.stringify(copy));
        imported.push(copy);
      } catch (e) { console.warn('failed to import record', e); }
    }

    // Rebuild master sheepList as array of objects (the app merges these in places)
    try {
      const master = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.indexOf('sheep-') === 0) {
          try {
            const raw = JSON.parse(localStorage.getItem(key) || 'null');
            if (raw && raw.id) master.push(raw);
          } catch (e) { }
        }
      }
      localStorage.setItem('sheepList', JSON.stringify(master));
    } catch (e) { console.warn('failed to build sheepList', e); }

    console.info('Imported', imported.length, 'sheep into localStorage.');
    alert('Imported ' + imported.length + ' sheep into localStorage. Reload the page to see them.');
  } catch (err) {
    console.error(err);
    alert('Import failed: ' + (err && err.message));
  }
})();
