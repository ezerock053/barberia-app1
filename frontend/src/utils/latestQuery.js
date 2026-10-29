// A cleanup invalidates both successful and failed responses from an old query.
export function loadLatestQuery(load, publish) {
  let active = true;
  Promise.resolve().then(load).then(
    (data) => { if (active) publish({ data, loading: false, error: '' }); },
    (error) => { if (active) publish({ data: [], loading: false, error: error.message || 'No pudimos cargar los datos.' }); },
  );
  return () => { active = false; };
}
