import { Client, ContentFlagReasonEnum } from '@amityco/ts-sdk';

export type FlagContentParams = {
  /** Sent as is: a preset reason, a custom one, or Others. Defaults to Others. */
  reason?: string;
  /** The reporter's own words, sent with Others. */
  detail?: string;
};

/**
 * Report a post or comment by calling the flag endpoint directly rather than
 * PostRepository.flagPost / CommentRepository.flagComment. Those send any
 * reason that is not one of the SDK's presets as Others, moving it into
 * `detail`, so a custom reason such as "Intellectual property infringement"
 * could never be filed as a reason of its own. Errors are unchanged: the SDK
 * makes the same call through this client.
 *
 * Unlike the SDK calls, this does not update the SDK cache or fire its flagged
 * event; callers refresh whatever they read afterwards.
 */
export const flagContent = async (
  contentType: 'post' | 'comment',
  contentId: string,
  { reason = ContentFlagReasonEnum.Others, detail = '' }: FlagContentParams,
): Promise<boolean> => {
  const resource = contentType === 'post' ? 'posts' : 'comments';
  const { data } = await Client.getActiveClient().http.post(
    `/api/v3/${resource}/${encodeURIComponent(contentId)}/flag`,
    { reason, detail },
  );
  return !!data;
};
