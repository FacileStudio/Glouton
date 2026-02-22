import type { Meta, StoryObj } from '@storybook/svelte';
import Badge from './Badge.svelte';

const meta = {
  title: 'Atoms/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'accent', 'success', 'warning', 'danger', 'slate'],
      description: 'The badge color variant',
    },
  } as any,
} satisfies Meta<Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
  render: (args) => ({
    Component: Badge,
    props: args,
    slot: 'Primary',
  }),
};

export const Accent: Story = {
  args: {
    variant: 'accent',
  },
  render: (args) => ({
    Component: Badge,
    props: args,
    slot: 'Accent',
  }),
};

export const Success: Story = {
  args: {
    variant: 'success',
  },
  render: (args) => ({
    Component: Badge,
    props: args,
    slot: 'Success',
  }),
};

export const Warning: Story = {
  args: {
    variant: 'warning',
  },
  render: (args) => ({
    Component: Badge,
    props: args,
    slot: 'Warning',
  }),
};

export const Danger: Story = {
  args: {
    variant: 'danger',
  },
  render: (args) => ({
    Component: Badge,
    props: args,
    slot: 'Danger',
  }),
};

export const Slate: Story = {
  args: {
    variant: 'slate',
  },
  render: (args) => ({
    Component: Badge,
    props: args,
    slot: 'Slate',
  }),
};

export const Status: Story = {
  render: () => ({
    Component: Badge,
    props: { variant: 'success' },
    slot: 'Active',
  }),
};
