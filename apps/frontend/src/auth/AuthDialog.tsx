import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";
import type {
  AuthState,
  AuthUser,
  ServiceError,
  ServiceResult,
} from "../services/contracts";
import { useServiceContext } from "../app/service-context";
import type { DemoGuidance } from "../app/service-context";
import "./auth.css";

type Flow = "signIn" | "register" | "reset";
type Action =
  "signIn" | "register" | "reset" | "resend" | "refresh" | "signOut";
const progress: Record<Action, string> = {
  signIn: "Signing in…",
  register: "Creating your account…",
  reset: "Requesting a password reset…",
  resend: "Sending a verification email…",
  refresh: "Checking your verification status…",
  signOut: "Signing out…",
};
const failure: Record<Action, string> = {
  signIn: "The email or password is incorrect. Check them and try again.",
  register:
    "We couldn't create an account for this email. It may already be registered: sign in or reset your password instead.",
  reset:
    "We couldn't send a reset email to this address. Check the address and try again.",
  resend: "The verification email could not be sent. Try again.",
  refresh: "Your verification status could not be checked. Try again.",
  signOut: "Sign out failed. Try again.",
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function describeAuthFailure(action: Action, error: ServiceError) {
  if (error.retryable || error.code === "TEMPORARILY_UNAVAILABLE")
    return `The account service is temporarily unavailable (reference ${error.request_id}). Try again.`;
  if (error.code === "AUTH_FAILED") return failure[action];
  return `${failure[action]} (reference ${error.request_id})`;
}
function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * One in-flight auth action per view. Duplicate submissions are ignored, and
 * unmounting (flow, account or unlock change) aborts and ignores the response.
 */
function useAuthAction() {
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );
  const run = useCallback(
    async (
      action: Action,
      operation: (signal: AbortSignal) => Promise<ServiceResult<void>>,
    ): Promise<ServiceResult<void> | null> => {
      if (controller.current) return null;
      const current = new AbortController();
      controller.current = current;
      setPending(action);
      try {
        const result = await operation(current.signal);
        return current.signal.aborted ? null : result;
      } catch (error) {
        if (current.signal.aborted || isAbort(error)) return null;
        return {
          ok: false,
          error: {
            code: "TEMPORARILY_UNAVAILABLE",
            message: "Unexpected account service failure",
            request_id: "auth-dialog",
            retryable: true,
          },
        };
      } finally {
        if (controller.current === current) {
          controller.current = null;
          setPending(null);
        }
      }
    },
    [],
  );
  return { pending, run };
}

function useInitialFocus<T extends HTMLElement>(): RefObject<T | null> {
  const target = useRef<T>(null);
  useEffect(() => target.current?.focus(), []);
  return target;
}

function Progress({ pending }: { pending: Action | null }) {
  return (
    <p className="auth-progress" aria-live="polite">
      {pending ? progress[pending] : ""}
    </p>
  );
}

function Field({
  id,
  label,
  error,
  describedBy,
  inputRef,
  initialFocus,
  ...input
}: {
  id: string;
  label: string;
  error?: string;
  describedBy?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  initialFocus?: boolean;
  type: "email" | "password";
  value: string;
  autoComplete: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  const described =
    [error ? errorId : null, describedBy].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        type={input.type}
        name={input.type}
        value={input.value}
        autoComplete={input.autoComplete}
        readOnly={input.readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        data-initial-focus={initialFocus ? "" : undefined}
        onChange={(event) => input.onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} className="auth-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

interface FieldErrors {
  email?: string;
  password?: string;
}
function validate(
  email: string,
  password: string | null,
  register = false,
): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = email.trim();
  if (!trimmed) errors.email = "Enter your email address.";
  else if (!emailPattern.test(trimmed))
    errors.email = "Enter a valid email address, such as name@example.com.";
  if (password !== null) {
    if (!password) errors.password = "Enter your password.";
    else if (register && password.length < 6)
      errors.password = "Use at least 6 characters.";
  }
  return errors;
}

/** Email/password form shared by sign-in and self-registration. */
function CredentialsForm({
  mode,
  email,
  setEmail,
  sessionNotice,
  onSwitch,
}: {
  mode: "signIn" | "register";
  email: string;
  setEmail: (value: string) => void;
  sessionNotice: string | null;
  onSwitch: (flow: Flow) => void;
}) {
  const { services } = useServiceContext();
  const { pending, run } = useAuthAction();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useInitialFocus<HTMLInputElement>();
  const passwordRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const formErrorId = `${id}-form-error`;
  const noticeId = `${id}-notice`;
  const register = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextErrors = validate(email, password, register);
    setErrors(nextErrors);
    setFormError(null);
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    const credentials = { email: email.trim(), password };
    const result = await run(mode, (signal) =>
      register
        ? services.auth.register(credentials, { signal })
        : services.auth.signIn(credentials, { signal }),
    );
    // Success is observed through auth state; the guard alone unlocks data.
    if (!result || result.ok) return;
    setPassword("");
    setFormError(describeAuthFailure(mode, result.error));
    emailRef.current?.focus();
  }

  const notice = !formError && !pending ? sessionNotice : null;
  const alertId = formError ? formErrorId : notice ? noticeId : undefined;
  return (
    <>
      {notice && (
        <p id={noticeId} className="auth-message" role="alert">
          {notice}
        </p>
      )}
      <form
        noValidate
        aria-busy={pending !== null}
        onSubmit={(event) => void submit(event)}
      >
        {formError && (
          <p id={formErrorId} className="auth-message error" role="alert">
            {formError}
          </p>
        )}
        <Field
          id={`${id}-email`}
          label="Email"
          type="email"
          autoComplete={register ? "email" : "username"}
          value={email}
          readOnly={pending !== null}
          error={errors.email}
          describedBy={alertId}
          inputRef={emailRef}
          initialFocus
          onChange={setEmail}
        />
        <Field
          id={`${id}-password`}
          label="Password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          value={password}
          readOnly={pending !== null}
          error={errors.password}
          describedBy={register ? `${id}-password-hint` : undefined}
          inputRef={passwordRef}
          onChange={setPassword}
        />
        {register && (
          <p id={`${id}-password-hint`} className="auth-hint">
            Use at least 6 characters.
          </p>
        )}
        <button
          type="submit"
          className="primary"
          aria-disabled={pending ? true : undefined}
        >
          {register ? "Create account" : "Sign in"}
        </button>
        <Progress pending={pending} />
      </form>
      <div className="auth-links">
        {register ? (
          <button type="button" onClick={() => onSwitch("signIn")}>
            Back to sign in
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onSwitch("register")}>
              Create an account
            </button>
            <button type="button" onClick={() => onSwitch("reset")}>
              Forgot password?
            </button>
          </>
        )}
      </div>
    </>
  );
}

function ResetForm({
  email,
  setEmail,
  demo,
  onSwitch,
}: {
  email: string;
  setEmail: (value: string) => void;
  demo?: DemoGuidance;
  onSwitch: (flow: Flow) => void;
}) {
  const { services } = useServiceContext();
  const { pending, run } = useAuthAction();
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailRef = useInitialFocus<HTMLInputElement>();
  const returnRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (sentTo) returnRef.current?.focus();
  }, [sentTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextError = validate(email, null).email;
    setError(nextError);
    setFormError(null);
    if (nextError) {
      emailRef.current?.focus();
      return;
    }
    const address = email.trim();
    const result = await run("reset", (signal) =>
      services.auth.resetPassword(address, { signal }),
    );
    if (!result) return;
    if (result.ok) setSentTo(address);
    else {
      setFormError(describeAuthFailure("reset", result.error));
      emailRef.current?.focus();
    }
  }

  if (sentTo)
    return (
      <>
        <p className="auth-message success" role="status">
          {demo
            ? `Local simulation: a password reset email for ${sentTo} was simulated. No email was sent. Return to sign in with the demo password ${demo.password}.`
            : `If an account exists for ${sentTo}, a password reset email is on its way. Follow its link, then return to sign in.`}
        </p>
        <div className="auth-links">
          <button
            ref={returnRef}
            type="button"
            className="primary"
            data-initial-focus=""
            onClick={() => onSwitch("signIn")}
          >
            Return to sign in
          </button>
        </div>
      </>
    );
  return (
    <>
      <form
        noValidate
        aria-busy={pending !== null}
        onSubmit={(event) => void submit(event)}
      >
        {formError && (
          <p
            id={`${id}-form-error`}
            className="auth-message error"
            role="alert"
          >
            {formError}
          </p>
        )}
        <Field
          id={`${id}-email`}
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          readOnly={pending !== null}
          error={error}
          describedBy={formError ? `${id}-form-error` : undefined}
          inputRef={emailRef}
          initialFocus
          onChange={setEmail}
        />
        <button
          type="submit"
          className="primary"
          aria-disabled={pending ? true : undefined}
        >
          Send reset email
        </button>
        <Progress pending={pending} />
      </form>
      <div className="auth-links">
        <button type="button" onClick={() => onSwitch("signIn")}>
          Back to sign in
        </button>
      </div>
    </>
  );
}

function VerifyPanel({ user, demo }: { user: AuthUser; demo?: DemoGuidance }) {
  const { services } = useServiceContext();
  const { pending, run } = useAuthAction();
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const resendRef = useInitialFocus<HTMLButtonElement>();

  async function act(
    action: "resend" | "refresh" | "signOut",
    operation: (signal: AbortSignal) => Promise<ServiceResult<void>>,
  ) {
    if (pending) return;
    setMessage(null);
    const result = await run(action, operation);
    // A verified refresh or signout unmounts this panel; any remaining result applies here.
    if (!result) return;
    if (!result.ok)
      setMessage({
        text: describeAuthFailure(action, result.error),
        error: true,
      });
    else if (action === "resend")
      setMessage({
        text: demo
          ? `Local simulation: a verification email for ${user.email} was simulated. No email was sent. Choose “I've verified my email” to simulate opening its link.`
          : `A verification email was sent to ${user.email}. Open its link, then choose “I've verified my email”.`,
        error: false,
      });
    else if (action === "refresh")
      setMessage({
        text: "Your email address is not verified yet. Open the verification link, or resend the email, then try again.",
        error: false,
      });
  }

  return (
    <>
      <p className="auth-account">
        Signed in as <strong>{user.email}</strong>
      </p>
      {demo && (
        <p className="auth-hint">
          Local simulation: no email is sent. Choose “Resend verification email”
          and then “I've verified my email” to simulate following the link.
        </p>
      )}
      {message && (
        <p
          className={`auth-message ${message.error ? "error" : "info"}`}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      <div className="auth-actions" aria-busy={pending !== null}>
        <button
          ref={resendRef}
          type="button"
          className="primary"
          data-initial-focus=""
          aria-disabled={pending ? true : undefined}
          onClick={() =>
            void act("resend", (signal) =>
              services.auth.sendVerification({ signal }),
            )
          }
        >
          Resend verification email
        </button>
        <button
          type="button"
          aria-disabled={pending ? true : undefined}
          onClick={() =>
            void act("refresh", (signal) =>
              services.auth.refreshSession({ signal }),
            )
          }
        >
          I've verified my email
        </button>
        <button
          type="button"
          aria-disabled={pending ? true : undefined}
          onClick={() =>
            // Not aborted on unmount: the guarded signout locks first, unmounting this panel.
            void act("signOut", () => services.auth.signOut())
          }
        >
          Use a different account
        </button>
      </div>
      <Progress pending={pending} />
    </>
  );
}

function DemoDetails({ demo }: { demo?: DemoGuidance }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="auth-demo">
      <button
        type="button"
        className="link"
        aria-expanded={open}
        aria-controls="demo-details"
        onClick={() => setOpen(!open)}
      >
        About this demo
      </button>
      <div id="demo-details" hidden={!open}>
        <p>
          This local simulation uses synthetic services. No live account or
          email delivery is connected.
        </p>
        {demo && (
          <ul>
            <li>
              Every demo account uses the password <code>{demo.password}</code>.
            </li>
            <li>
              Verified account: <code>{demo.verified_email}</code>
            </li>
            <li>
              Unverified account: <code>{demo.unverified_email}</code>
            </li>
            <li>
              Register any new <code>@example.invalid</code> address, such as{" "}
              <code>{demo.registration_example}</code>, with the demo password.
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

const headings: Record<Flow | "verify", string> = {
  signIn: "Sign in to LCA diff",
  register: "Create an account",
  reset: "Reset your password",
  verify: "Verify your email",
};
const descriptions: Record<Flow | "verify", string> = {
  signIn: "A verified account is required to browse and compare processes.",
  register:
    "Register with your email address. You'll need to verify it before browsing or comparing processes.",
  reset: "Enter your account email and we'll send a password reset link.",
  verify:
    "Email verification is required before browsing or comparing processes.",
};

/**
 * Required login modal. The native dialog supplies focus containment and the
 * top-layer backdrop; it cannot be dismissed into the (inert) shell. Only the
 * observed auth state unlocks the application, never a form result.
 */
export function AuthDialog({ auth }: { auth: AuthState }) {
  const { demo, mode } = useServiceContext();
  const dialog = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const [flow, setFlow] = useState<Flow>("signIn");
  const [email, setEmail] = useState("");
  const unverified =
    auth.status === "authenticated" && !auth.user.email_verified
      ? auth.user
      : null;
  const view = unverified ? "verify" : flow;
  useEffect(() => {
    const target = dialog.current!;
    const previousFocus = document.activeElement;
    closing.current = false;
    if (!target.open) target.showModal();
    target.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      closing.current = true;
      target.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  let body: ReactNode;
  if (unverified)
    body = <VerifyPanel key={unverified.uid} user={unverified} demo={demo} />;
  else if (flow === "reset")
    body = (
      <ResetForm
        key="reset"
        email={email}
        setEmail={setEmail}
        demo={demo}
        onSwitch={setFlow}
      />
    );
  else
    body = (
      <CredentialsForm
        key={flow}
        mode={flow}
        email={email}
        setEmail={setEmail}
        sessionNotice={
          auth.status === "error"
            ? "Your session could not be confirmed. Sign in again to continue."
            : null
        }
        onSwitch={setFlow}
      />
    );
  return (
    <dialog
      ref={dialog}
      className="login-dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      aria-describedby="login-description"
      onCancel={(event) => event.preventDefault()}
      onClose={() => {
        // Browsers may force-close after repeated Escape; login stays required.
        const target = dialog.current;
        if (target && !closing.current && !target.open) {
          target.showModal();
          target.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
        }
      }}
    >
      <p className="eyebrow">
        {mode === "mock" ? "LCA diff · Local demo" : "LCA diff"}
      </p>
      <h2 id="login-title">{headings[view]}</h2>
      <p id="login-description">{descriptions[view]}</p>
      {body}
      <DemoDetails demo={demo} />
    </dialog>
  );
}
