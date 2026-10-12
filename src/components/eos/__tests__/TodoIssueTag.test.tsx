/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TodoIssueTag } from '../TodoIssueTag';

describe('TodoIssueTag', () => {
  it('names the IDS issue the to-do came from', () => {
    render(<TodoIssueTag issueTitle="Admin support " />);
    expect(screen.getByText('From IDS: Admin support')).toBeInTheDocument();
  });

  it('renders nothing for a to-do that was not created from an issue', () => {
    const { container, rerender } = render(<TodoIssueTag issueTitle={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TodoIssueTag />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TodoIssueTag issueTitle="   " />);
    expect(container).toBeEmptyDOMElement();
  });
});
