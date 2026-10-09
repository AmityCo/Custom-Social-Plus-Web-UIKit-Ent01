import React, { useEffect, useRef, useState } from 'react';
import { resolveString } from '~/v4/core/localization';
import styles from './EditUserProfilePage.module.css';
import Camera from '~/v4/icons/Camera';
import { Form } from 'react-aria-components';
import { BackButton } from '~/v4/social/elements/BackButton';
import { useAmityPage } from '~/v4/core/hooks/uikit';
import { useNavigation } from '~/v4/core/providers/NavigationProvider';
import { Title } from '~/v4/social/elements/Title/Title';
import { Button } from '~/v4/core/natives/Button/Button';
import { UpdateUserProfileButton } from '~/v4/social/elements/UpdateUserProfileButton';
import { UserAvatar } from '~/v4/social/elements/UserAvatar/UserAvatar';
import { useUser } from '~/v4/core/hooks/objects/useUser';
import { useMutation } from '@tanstack/react-query';
import { FileRepository, UserRepository } from '@amityco/ts-sdk';
import { useNotifications } from '~/v4/core/providers/NotificationProvider';
import { UnderlineInput } from '~/v4/social/internal-components/UnderlineInput';
import { useConfirmContext } from '~/v4/core/providers/ConfirmProvider';
import { useNetworkState } from 'react-use';
import useUserSettings from '~/v4/social/hooks/useUserSettings';
import { getProfileErrorDetail } from '~/v4/social/utils/getProfileErrorDetail';

interface EditUserProfilePageProps {
  userId: string;
}

const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_ABOUT_LENGTH = 180;

export const EditUserProfilePage: React.FC<EditUserProfilePageProps> = ({ userId }) => {
  const pageId = 'edit_user_profile_page';
  const notification = useNotifications();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { themeStyles } = useAmityPage({ pageId });
  const { onBack } = useNavigation();
  const { online } = useNetworkState();
  const { confirm, info } = useConfirmContext();
  const { userSettings } = useUserSettings();
  const { user } = useUser({ userId });

  const [displayName, setDisplayName] = useState(user?.displayName || undefined);
  const [description, setDescription] = useState(user?.description || undefined);
  const [image, setImage] = useState<File | null>(null);
  const [newImage, setNewImage] = useState<Amity.File<'image'> | null>(null);

  useEffect(() => {
    user?.displayName && setDisplayName(user.displayName);
    setDescription(user?.description ?? '');
  }, [user?.displayName, user?.description]);

  const uploadImage = async (image: File) => {
    const formData = new FormData();
    formData.append('files', image);
    try {
      const { data } = await FileRepository.uploadImage(formData);
      setNewImage(data[0]);
    } catch (error) {
      // Matched by code, not exact message, so any rejection (nudity 500000,
      // suggestive/violent 400314) gets the same detail as the create page.
      info({
        pageId: pageId,
        type: 'info',
        ...getProfileErrorDetail(error, 'edit'),
      });
    }
  };

  useEffect(() => {
    if (image) {
      uploadImage(image);
    }
  }, [image]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [description]);

  const useMutateEditUserProfile = () =>
    useMutation({
      mutationFn: async (params: Parameters<typeof UserRepository.updateUser>[1]) => {
        return await UserRepository.updateUser(userId, params);
      },
      onSuccess: () => {
        onBack();
        notification.success({
          content: resolveString('amity_social_toast_snackbar_profile_updated'),
        });
      },
      onError: (error) => {
        info({
          pageId: pageId,
          type: 'info',
          ...getProfileErrorDetail(error, 'edit'),
        });
      },
    });

  // `mutate`, not `mutateAsync`: failures are shown by onError, and an
  // un-awaited mutateAsync would also leak them as unhandled rejections.
  const { mutate: mutateUpdateEditUserProfile, isPending } = useMutateEditUserProfile();

  const submitForm = (e: any) => {
    const updatedValue = {
      displayName: displayName !== user?.displayName ? displayName : undefined,
      description: description !== user?.description ? description : undefined,
      avatarFileId: newImage?.fileId,
    };
    e.preventDefault();
    if (!online) {
      // Offline gets the same popup as a request that got no response.
      info({
        pageId: pageId,
        type: 'info',
        ...getProfileErrorDetail(new Error('Network Error'), 'edit'),
      });
      return;
    }
    user?.userId && mutateUpdateEditUserProfile(updatedValue);
  };

  const triggerFileInput = () => {
    const fileInput = document.getElementById('image-upload') as HTMLInputElement;
    fileInput.click();
  };

  const onChangeImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setImage(e.target.files?.[0] || null);
  };

  const isNoEditing =
    !displayName ||
    ((user?.displayName === displayName || (user?.displayName == undefined && displayName == '')) &&
      (user?.description === description ||
        (user?.description == undefined && description == '')) &&
      !newImage);

  const onPressBackButton = () => {
    if (!isNoEditing)
      confirm({
        pageId: pageId,
        type: 'confirm',
        title: resolveString('amity_social_modal_community_setup_dialog_leave_edit_title'),
        content: resolveString('amity_social_modal_community_setup_dialog_leave_edit_description'),
        onOk: () => {
          onBack();
        },
        okText: resolveString('amity_social_modal_dialog_discard_button'),
        cancelText: resolveString('amity_social_modal_dialog_cancel_button'),
      });
    else onBack();
  };

  return (
    <div className={styles.editUserProfilePage} style={themeStyles}>
      <div className={styles.editUserProfilePage__topSection}>
        <BackButton
          pageId={pageId}
          onPress={onPressBackButton}
          defaultClassName={styles.editUserProfilePage__topSection__backButton}
        />
        <Title
          pageId={pageId}
          componentId={userId}
          titleClassName={styles.editUserProfilePage__topSection__title}
          textKey="amity_social_button_edit_profile"
        />
      </div>
      <div className={styles.editUserProfilePage__container}>
        <div className={styles.editUserProfilePage__avatarContainer}>
          {newImage ? (
            <img
              src={newImage.fileUrl}
              alt="avatar"
              className={styles.editUserProfilePage__avatar}
            />
          ) : (
            <UserAvatar
              userId={userId}
              className={styles.editUserProfilePage__avatar}
              textPlaceholderClassName={styles.editUserProfilePage__avatarPlaceholder}
            />
          )}
          <Button className={styles.editUserProfilePage__avatarOverlay} onPress={triggerFileInput}>
            <Camera className={styles.editUserProfilePage__icon} />
            <input
              type="file"
              onChange={onChangeImage}
              multiple
              id="image-upload"
              accept="image/png,image/jpg"
              className={styles.editUserProfilePage__imageInput}
            />
          </Button>
        </div>

        <Form onSubmit={submitForm} className={styles.editUserProfilePage__form}>
          <div className={styles.editUserProfilePage__fromInputWrap}>
            <UnderlineInput
              name="userDisplayName"
              pageId={pageId}
              elementId="user_display_name_title"
              textKey="amity_social_label_edit_user_display_name_title"
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              value={displayName}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDisplayName(e.target.value)
              }
              showCounter={true}
              disabled={!userSettings?.isAllowUpdateDisplayName}
            />
            <UnderlineInput
              name="userAbout"
              pageId={pageId}
              elementId="user_about_title"
              textKey="amity_social_label_edit_user_about_title"
              maxLength={MAX_ABOUT_LENGTH}
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              showCounter={true}
              optional={true}
            />
          </div>
          <UpdateUserProfileButton pageId={pageId} disabled={isNoEditing || isPending} />
        </Form>
      </div>
    </div>
  );
};
