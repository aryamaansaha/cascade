/**
 * Notification utilities using Mantine notifications.
 */

import { notifications } from '@mantine/notifications';

export const notify = {
  success: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Success',
      message,
      color: 'teal',
      autoClose: 3000,
    });
  },

  error: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Error',
      message,
      color: 'red',
      autoClose: 5000,
    });
  },

  warning: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Warning',
      message,
      color: 'yellow',
      autoClose: 4000,
    });
  },

  info: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Info',
      message,
      color: 'blue',
      autoClose: 3000,
    });
  },
};

export default notify;

