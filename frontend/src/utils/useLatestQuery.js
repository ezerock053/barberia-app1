import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLatestQuery } from './latestQuery.js';

const empty = [];
export function useLatestQuery(key, load) {
  const loader = useRef(load);
  loader.current = load;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key: null, revision: -1, data: empty, loading: false, error: '' });
  useEffect(() => {
    if (key === null) return undefined;
    setState({ key, revision, data: empty, loading: true, error: '' });
    return loadLatestQuery(loader.current, (result) => setState({ key, revision, ...result }));
  }, [key, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const setData = useCallback((update) => setState((current) => {
    if (current.key !== key || current.revision !== revision) return current;
    return { ...current, data: typeof update === 'function' ? update(current.data) : update };
  }), [key, revision]);
  // Hide the old data immediately when a filter changes, even before effect cleanup.
  const current = state.key === key && state.revision === revision;
  return { data: current && key !== null ? state.data : empty,
    loading: key !== null && (!current || state.loading), error: current && key !== null ? state.error : '', refresh, setData };
}
