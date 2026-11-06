import { Component, Suspense } from 'react';
import { Alert, Button, Container } from 'react-bootstrap';

export function ModuleLoading({ fullPage = false, children = 'Cargando sección…' }) {
  const loading = <div className="admin-auth-loading" role="status">
    <span className="spinner-border" aria-hidden="true" />
    <span>{children}</span>
  </div>;

  return fullPage
    ? <main className="admin-auth-shell">{loading}</main>
    : <div className="py-5">{loading}</div>;
}

export function LazyModuleBoundary({ children, fullPage = false }) {
  return <ModuleLoadErrorBoundary fullPage={fullPage}>{children}</ModuleLoadErrorBoundary>;
}

export function LazyModuleSuspense({ children, fullPage = false, label }) {
  return <Suspense fallback={<ModuleLoading fullPage={fullPage}>{label}</ModuleLoading>}>
    {children}
  </Suspense>;
}

class ModuleLoadErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  retry = () => {
    const retryUrl = new URL(window.location.href);
    retryUrl.searchParams.set('__module_retry', String(Date.now()));
    window.location.replace(retryUrl.href);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = <Container className="admin-auth-error">
      <Alert variant="warning" role="alert">
        No pudimos cargar esta sección. Revisá tu conexión e intentá nuevamente.
      </Alert>
      <Button variant="outline-warning" onClick={this.retry}>Reintentar</Button>
    </Container>;

    return this.props.fullPage
      ? <main className="admin-auth-shell">{message}</main>
      : <div className="py-4">{message}</div>;
  }
}
