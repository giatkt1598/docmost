import { rem } from '@mantine/core';
import sprintBootLogo from '@/assets/icons/sprint-boot.png';

interface Props {
  size?: number | string;
}

export function SprintBootIcon({ size }: Props) {
  return (
    <img
      src={sprintBootLogo}
      alt=""
      style={{ width: rem(size), height: rem(size) }}
    />
  );
}
