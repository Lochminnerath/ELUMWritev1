import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { RedirectIfSignedIn, RequireAuth } from './auth/guards';
import { DocIcon } from './components/Brand';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SupportLinks } from './components/SupportLink';
import { FullPageLoader } from './components/Loader';
import { ToastProvider } from './components/Toast';
import { TooltipLayer } from './components/TooltipLayer';
import { AuthPage } from './pages/AuthPage';
import { HandoffPage } from './pages/HandoffPage';
import { HomePage } from './pages/HomePage';
import { PreferencesProvider } from './preferences/PreferencesProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { WhatsNew } from './whatsnew/WhatsNew';
import { SecurityLayer } from './security/SecurityLayer';

// The editor is the heaviest part of the app, so it loads on demand.
const EditorPage = lazy(() => import('./editor/EditorPage'));

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <PreferencesProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <Routes>
              <Route
                path="/signin"
                element={
                  <RedirectIfSignedIn>
                    <AuthPage mode="signin" />
                  </RedirectIfSignedIn>
                }
              />
              <Route
                path="/signup"
                element={
                  <RedirectIfSignedIn>
                    <AuthPage mode="signup" />
                  </RedirectIfSignedIn>
                }
              />
              <Route path="/auth/handoff" element={<HandoffPage />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <HomePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/d/:docId"
                element={
                  <RequireAuth>
                    <Suspense fallback={<FullPageLoader />}>
                      <EditorPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
          <TooltipLayer />
          <WhatsNew />
          <SecurityLayer />
          </PreferencesProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function NotFound() {
  return (
    <div className="empty-state" style={{ minHeight: '100%', justifyContent: 'center' }}>
      <DocIcon size={72} />
      <h2>We could not find that page</h2>
      <p>The link may be wrong, or the page may have moved.</p>
      <Link to="/" className="elum-btn elum-btn--primary">
        Go to your documents
      </Link>
      <SupportLinks app="write" code="not-found" message="We could not find that page" />
    </div>
  );
}
