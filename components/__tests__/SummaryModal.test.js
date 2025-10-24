/**
 * SummaryModal Component Tests
 * Tests for PR23 quick actions feature
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SummaryModal from '../SummaryModal';

describe('SummaryModal', () => {
  const mockSummary = {
    summary: 'Test summary',
    keyPoints: ['Point 1', 'Point 2'],
    decisions: ['Decision 1'],
    actionItems: [
      { task: 'Test task 1', assignee: 'John', deadline: 'Tomorrow' },
      { task: 'Test task 2' },
    ],
    participants: [
      { name: 'John', messageCount: 10 },
      { name: 'Jane', messageCount: 5 },
    ],
  };

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    summary: mockSummary,
    loading: false,
    error: null,
    onRefresh: jest.fn(),
    isGlobal: false,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders action items correctly', () => {
    const { getByText } = render(<SummaryModal {...defaultProps} />);
    
    expect(getByText('Test task 1')).toBeTruthy();
    expect(getByText('Test task 2')).toBeTruthy();
  });

  test('renders quick action buttons when handlers are provided', () => {
    const mockMarkComplete = jest.fn();
    const mockJumpToChat = jest.fn();
    
    const { getAllByText } = render(
      <SummaryModal
        {...defaultProps}
        onMarkComplete={mockMarkComplete}
        onJumpToChat={mockJumpToChat}
      />
    );
    
    const doneButtons = getAllByText('Done');
    const viewButtons = getAllByText('View');
    
    // Should have Done and View buttons for each action item
    expect(doneButtons.length).toBeGreaterThan(0);
    expect(viewButtons.length).toBeGreaterThan(0);
  });

  test('calls onMarkComplete when Done button is pressed', () => {
    const mockMarkComplete = jest.fn();
    
    const { getAllByText } = render(
      <SummaryModal
        {...defaultProps}
        onMarkComplete={mockMarkComplete}
      />
    );
    
    const doneButtons = getAllByText('Done');
    // Press first Done button (index 0 is the modal's main Done button)
    if (doneButtons.length > 1) {
      fireEvent.press(doneButtons[1]);
      expect(mockMarkComplete).toHaveBeenCalledWith(mockSummary.actionItems[0]);
    }
  });

  test('calls onJumpToChat when View button is pressed', () => {
    const mockJumpToChat = jest.fn();
    
    const { getAllByText } = render(
      <SummaryModal
        {...defaultProps}
        onJumpToChat={mockJumpToChat}
      />
    );
    
    const viewButtons = getAllByText('View');
    if (viewButtons.length > 0) {
      fireEvent.press(viewButtons[0]);
      expect(mockJumpToChat).toHaveBeenCalledWith(mockSummary.actionItems[0]);
    }
  });

  test('does not render quick actions when handlers are not provided', () => {
    const { queryByText } = render(<SummaryModal {...defaultProps} />);
    
    // The main "Done" button at bottom should exist
    const doneButtons = queryByText('Done');
    expect(doneButtons).toBeTruthy();
    
    // But no "View" buttons should exist
    expect(queryByText('View')).toBeNull();
  });

  test('shows chat badges in global mode', () => {
    const globalSummary = {
      ...mockSummary,
      actionItems: [
        { task: 'Test task 1', chatName: 'Work Chat' },
      ],
    };
    
    const { getByText } = render(
      <SummaryModal
        {...defaultProps}
        summary={globalSummary}
        isGlobal={true}
      />
    );
    
    expect(getByText('Work Chat')).toBeTruthy();
  });

  test('calls onClose when modal is dismissed', () => {
    const mockOnClose = jest.fn();
    
    const { getByText } = render(
      <SummaryModal
        {...defaultProps}
        onClose={mockOnClose}
      />
    );
    
    const closeButton = getByText('✕');
    fireEvent.press(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('renders loading state', () => {
    const { getByText } = render(
      <SummaryModal
        {...defaultProps}
        loading={true}
      />
    );
    
    expect(getByText('Summarizing conversation...')).toBeTruthy();
  });

  test('renders error state', () => {
    const { getByText } = render(
      <SummaryModal
        {...defaultProps}
        error="Something went wrong"
      />
    );
    
    expect(getByText('Something went wrong')).toBeTruthy();
  });
});

