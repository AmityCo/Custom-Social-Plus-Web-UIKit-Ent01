import React from 'react';
import clsx from 'clsx';
import { useAmityComponent } from '~/v4/core/hooks/uikit';
import { CameraButton } from '~/v4/social/elements/CameraButton';
import { ImageButton } from '~/v4/social/elements/ImageButton';
import { VideoButton } from '~/v4/social/elements/VideoButton';
import styles from './MediaAttachment.module.css';
import { ProductTagActionButton } from '~/v4/social/features/product-tagged';
import { useResponsive } from '~/v4/core/hooks/useResponsive';
import { useUserCapabilities } from '~/v4/core/hooks/useUserCapabilities';

const MAX_UPLOAD_MEDIA = 10;

interface MediaAttachmentProps {
  pageId: string;
  sourceId?: string;
  isVisibleCamera: boolean;
  isVisibleImage: boolean;
  isVisibleVideo: boolean;
  totalMedia?: number;
  productTags?: Amity.ProductTag[];
  onVideoFileChange?: (files: File[], fileType?: string) => void;
  onImageFileChange?: (files: File[], fileType?: string) => void;
}

export function MediaAttachment({
  pageId,
  sourceId,
  isVisibleCamera,
  isVisibleImage,
  isVisibleVideo,
  totalMedia = 0,
  productTags = [],
  onVideoFileChange,
  onImageFileChange,
}: MediaAttachmentProps) {
  const componentId = 'media_attachment';
  const { themeStyles, accessibilityId, isExcluded } = useAmityComponent({ pageId, componentId });
  const { isDesktop } = useResponsive();
  const { canPostVideo } = useUserCapabilities();

  // Combined with the caller's existing flag rather than replacing it: video is
  // shown only when the caller asked for it AND the user may post video.
  const isVisibleVideoAllowed = isVisibleVideo && canPostVideo;

  if (isExcluded) return null;

  return (
    <div style={themeStyles} data-testid={accessibilityId} className={styles.mediaAttachment}>
      <div className={styles.mediaAttachment__swipeDown} />
      <div className={styles.mediaAttachment__actionButton_wrapper}>
        <div
          className={clsx(
            !isVisibleImage || !isVisibleVideoAllowed || !isVisibleCamera
              ? styles.mediaAttachment__wrapMedia_2items
              : styles.mediaAttachment__wrapMedia,
          )}
        >
          {isVisibleCamera && (
            <CameraButton
              pageId={pageId}
              componentId={componentId}
              isVisibleImage={isVisibleImage}
              isVisibleVideo={isVisibleVideoAllowed}
              onVideoFileChange={onVideoFileChange}
              onImageFileChange={onImageFileChange}
              isDisabled={!!totalMedia && totalMedia >= MAX_UPLOAD_MEDIA}
              textId=""
            />
          )}
          {isVisibleImage && (
            <ImageButton
              pageId={pageId}
              componentId={componentId}
              onImageFileChange={onImageFileChange}
              isDisabled={!!totalMedia && totalMedia >= MAX_UPLOAD_MEDIA}
              textId=""
            />
          )}

          {isVisibleVideoAllowed && (
            <VideoButton
              pageId={pageId}
              componentId={componentId}
              onVideoFileChange={onVideoFileChange}
              isDisabled={!!totalMedia && totalMedia >= MAX_UPLOAD_MEDIA}
              textId=""
            />
          )}
        </div>
        {isDesktop && productTags.length > 0 && (
          <ProductTagActionButton productTags={productTags} pageId={pageId} />
        )}
      </div>
    </div>
  );
}
