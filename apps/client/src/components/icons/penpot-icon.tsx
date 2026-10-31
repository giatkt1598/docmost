import { rem } from '@mantine/core';
import penpotLogo from '@/assets/icons/penpot.svg';

interface Props {
  size?: number | string;
}

export function PenpotIcon({ size }: Props) {
  return (
    <img
      src={penpotLogo}
      alt=""
      style={{ width: rem(size), height: rem(size) }}
    />
  );
}
