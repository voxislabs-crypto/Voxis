// Mock Clerk hooks for development.
// Keep object/function identities stable so effects depending on auth helpers
// (e.g. useAuthFetch) do not retrigger on every render.
const mockGetToken = () => Promise.resolve("dev-token-mock-auth");
const mockSignOut = () => Promise.resolve();

const mockAuth = Object.freeze({
  isSignedIn: true,
  isLoaded: true,
  userId: "1", // Use numeric ID for backend compatibility
  sessionId: "dev-session-1",
  getToken: mockGetToken,
  signOut: mockSignOut,
});

const mockUser = Object.freeze({
  id: "1",
  firstName: "Dev",
  lastName: "User",
  fullName: "Dev User",
  emailAddresses: [{ emailAddress: "dev@example.com" }],
});

const mockUseUser = Object.freeze({
  isLoaded: true,
  isSignedIn: true,
  user: mockUser,
});

export const useAuth = () => mockAuth;

export const useUser = () => mockUseUser;

export const ClerkProvider = ({ children }) => <>{children}</>;
export const SignIn = () => <div>Sign In (Mock)</div>;
export const SignUp = () => <div>Sign Up (Mock)</div>;
export const UserButton = () => <div>User Button (Mock)</div>;
