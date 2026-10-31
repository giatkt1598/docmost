import { rem } from '@mantine/core';
import giteaLogo from '@/assets/icons/gitea.svg';

interface Props {
  size?: number | string;
}

export function GiteaIcon({ size }: Props) {
  return (
    <img
      src={giteaLogo}
      alt=""
      style={{ width: rem(size), height: rem(size) }}
    />
  );
}
