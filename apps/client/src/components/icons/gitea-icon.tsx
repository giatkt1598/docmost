import { rem } from '@mantine/core';

interface Props {
  size?: number | string;
}

export function GiteaIcon({ size }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      style={{ width: rem(size), height: rem(size) }}
    >
      <path
        fill="#609926"
        d="M4 6h14v2h1.5A3.5 3.5 0 0 1 23 11.5v1a3.5 3.5 0 0 1-3.5 3.5h-1.9A7 7 0 0 1 11 21H9a7 7 0 0 1-7-7V8a2 2 0 0 1 2-2Zm14 4v4h1.5a1.5 1.5 0 0 0 1.5-1.5v-1a1.5 1.5 0 0 0-1.5-1.5H18Z"
      />
      <path
        fill="#fff"
        d="M9.2 9.2h1.6v2.3a1.8 1.8 0 1 1-1.6 3.2 1.8 1.8 0 0 1 .4-3.1l-.4-2.4Z"
      />
    </svg>
  );
}
