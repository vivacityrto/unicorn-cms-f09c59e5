import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Authentication Test Suite
 *
 * Tests cover:
 * - Login form validation (native HTML5 required/type=email constraints)
 * - Login submit flow (success and failure)
 * - Session persistence / sign-out via the real useAuth() hook
 *
 * Protected-route access (redirect unauthenticated users, allow
 * authenticated users through) is covered by the real ProtectedRoute
 * component in src/test/rbac/ProtectedRoute.test.tsx — not duplicated here.
 */

const {
  mockSignInWithPassword,
  mockSignOut,
  mockGetSession,
  mockOnAuthStateChange,
  mockToast,
  mockNavigate,
} = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockToast: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const chain = {
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          then: (resolve: (v: { data: never[]; error: null }) => void) =>
            resolve({ data: [], error: null }),
        };
        return chain;
      }),
    })),
  },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// Imported after mocks so the mocked modules are in place first.
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  describe("Form validation", () => {
    it("does not call signInWithPassword when email and password are empty", async () => {
      renderWithProviders(<Login />);
      await userEvent.click(screen.getByRole("button", { name: "Log In" }));
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("does not call signInWithPassword when the email fails the type=email constraint", async () => {
      renderWithProviders(<Login />);
      await userEvent.type(screen.getByLabelText("Email Address"), "not-an-email");
      await userEvent.type(screen.getByLabelText("Password"), "correct-password");
      await userEvent.click(screen.getByRole("button", { name: "Log In" }));
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });
  });

  describe("Submit flow", () => {
    it("calls signInWithPassword with the entered credentials and navigates on success", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      renderWithProviders(<Login />);
      await userEvent.type(screen.getByLabelText("Email Address"), "test@example.com");
      await userEvent.type(screen.getByLabelText("Password"), "correct-password");
      await userEvent.click(screen.getByRole("button", { name: "Log In" }));

      await waitFor(() =>
        expect(mockSignInWithPassword).toHaveBeenCalledWith({
          email: "test@example.com",
          password: "correct-password",
        })
      );
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/post-sign-in", { state: { fresh: true } }));
    });

    it("shows a destructive toast and does not navigate on invalid credentials", async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });

      renderWithProviders(<Login />);
      await userEvent.type(screen.getByLabelText("Email Address"), "test@example.com");
      await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
      await userEvent.click(screen.getByRole("button", { name: "Log In" }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Login failed",
            description: "Invalid login credentials",
            variant: "destructive",
          })
        )
      );
      expect(mockNavigate).not.toHaveBeenCalledWith("/post-sign-in", expect.anything());
    });
  });
});

describe("useAuth session management", () => {
  function AuthProbe() {
    const { user, loading, signOut } = useAuth();
    return (
      <div>
        <span data-testid="loading">{String(loading)}</span>
        <span data-testid="user-id">{user?.id ?? "none"}</span>
        <button onClick={() => void signOut()}>Sign Out</button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it("persists an existing session across a fresh mount (getSession)", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-123" } } },
    });

    renderWithProviders(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user-id").textContent).toBe("user-123");
  });

  it("clears local auth state and calls supabase.auth.signOut() on Sign Out", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-123" } } },
    });
    mockSignOut.mockResolvedValueOnce({ error: null });

    renderWithProviders(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("user-id").textContent).toBe("user-123"));
    await userEvent.click(screen.getByRole("button", { name: "Sign Out" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("user-id").textContent).toBe("none");
  });
});
