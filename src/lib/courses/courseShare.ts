export type CourseShareInput = {
  title: string;
  text: string;
  url: string;
};

export type CourseShareResult = "shared" | "copied" | "cancelled" | "failed";

type CourseShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    writeText: (text: string) => Promise<void>;
  };
};

function isShareCancellation(cause: unknown) {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    cause.name === "AbortError"
  );
}

export async function shareCourseLink(
  input: CourseShareInput,
  navigatorApi: CourseShareNavigator | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): Promise<CourseShareResult> {
  if (navigatorApi?.share) {
    try {
      await navigatorApi.share(input);
      return "shared";
    } catch (cause) {
      if (isShareCancellation(cause)) return "cancelled";
    }
  }

  if (navigatorApi?.clipboard?.writeText) {
    try {
      await navigatorApi.clipboard.writeText(input.url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}
