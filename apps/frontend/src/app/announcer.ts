import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useState,
} from "react";
import type { ReactNode } from "react";

type Announce = (message: string) => void;
const AnnouncerContext = createContext<Announce | null>(null);

/**
 * One polite live region for workspace operations whose control may unmount
 * as a result, such as removing the last column (#25). Mounted inside the
 * UID-keyed workspace, so signout or an account change discards its text.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState({ text: "", repeat: false });
  // A repeated message alternates a trailing no-break space so assistive
  // technology announces it again.
  const announce = useCallback<Announce>(
    (text) =>
      setMessage((previous) => ({
        text,
        repeat: previous.text === text ? !previous.repeat : false,
      })),
    [],
  );
  return createElement(
    Fragment,
    null,
    createElement(AnnouncerContext.Provider, { value: announce }, children),
    createElement(
      "p",
      {
        className: "visually-hidden",
        "aria-live": "polite",
        "data-testid": "workspace-announcer",
      },
      message.repeat ? `${message.text}\u00a0` : message.text,
    ),
  );
}

export function useAnnounce(): Announce {
  const announce = useContext(AnnouncerContext);
  if (!announce) throw new Error("useAnnounce requires an AnnouncerProvider");
  return announce;
}
