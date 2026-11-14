import * as React from 'react';

/**
 * Test stand-in for the Radix Select (which needs pointer-capture APIs jsdom
 * does not have). It renders a native <select> labelled by the trigger's
 * aria-label and fed by the SelectItem children, so tests can drive it with
 * userEvent.selectOptions.
 */
type ItemProps = { value: string; children?: React.ReactNode };

export const SelectItem = (_: ItemProps) => null;
export const SelectTrigger = (_: { 'aria-label'?: string; children?: React.ReactNode; className?: string; id?: string }) => null;
export const SelectValue = (_: { placeholder?: string }) => null;
export const SelectContent = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
export const SelectGroup = SelectContent;
export const SelectLabel = SelectContent;
export const SelectSeparator = () => null;
export const SelectScrollUpButton = () => null;
export const SelectScrollDownButton = () => null;

export function Select({
  value, onValueChange, children, disabled,
}: { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode; disabled?: boolean }) {
  let label: string | undefined;
  let id: string | undefined;
  const options: ItemProps[] = [];
  const walk = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (c) => {
      if (!React.isValidElement(c)) return;
      const props = c.props as { children?: React.ReactNode; 'aria-label'?: string; id?: string; value?: string };
      if (c.type === SelectTrigger) { label = props['aria-label']; id = props.id; }
      else if (c.type === SelectItem) options.push({ value: props.value as string, children: props.children });
      else if (props.children) walk(props.children);
    });
  };
  walk(children);
  return (
    <select
      aria-label={label}
      id={id}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.children}</option>)}
    </select>
  );
}
