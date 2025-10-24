/**
 * ChatListItem Component Tests
 * Tests for PR23 priority tooltip feature
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatListItem from '../ChatListItem';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('../../store/userStore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    currentUser: { userID: 'user1', displayName: 'Test User' },
  })),
}));

jest.mock('../../hooks/usePresence', () => ({
  usePresence: () => ({ isOnline: false }),
}));

describe('ChatListItem', () => {
  const mockChat = {
    chatID: 'chat1',
    type: 'direct',
    participantIDs: ['user1', 'user2'],
    participantNames: ['Test User', 'Other User'],
    lastMessageText: 'Hello world',
    lastMessageTimestamp: Date.now(),
  };

  const defaultProps = {
    chat: mockChat,
    isUnread: false,
    isUrgent: false,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders chat information correctly', () => {
    const { getByText } = render(<ChatListItem {...defaultProps} />);
    
    expect(getByText('Other User')).toBeTruthy();
    expect(getByText('Hello world')).toBeTruthy();
  });

  test('shows urgent badge when isUrgent is true', () => {
    const { getByText } = render(
      <ChatListItem {...defaultProps} isUrgent={true} />
    );
    
    expect(getByText('!')).toBeTruthy();
  });

  test('shows blue dot when isUnread is true', () => {
    const { getByTestId } = render(
      <ChatListItem {...defaultProps} isUnread={true} />
    );

    // Blue dot should be rendered
    expect(getByTestId('unread-blue-dot')).toBeTruthy();
  });

  test('does not show blue dot when isUnread is false', () => {
    const { queryByTestId } = render(
      <ChatListItem {...defaultProps} isUnread={false} />
    );

    // Blue dot should not be rendered
    expect(queryByTestId('unread-blue-dot')).toBeNull();
  });

  test('does not show tooltip initially', () => {
    const { queryByText } = render(
      <ChatListItem
        {...defaultProps}
        priorityScore={85}
        signals={{ hasUnansweredQuestion: true }}
      />
    );
    
    expect(queryByText('Priority Information')).toBeNull();
  });

  test('shows tooltip on long press when priorityScore is provided', () => {
    const { getByText, queryByText } = render(
      <ChatListItem
        {...defaultProps}
        priorityScore={85}
        signals={{ hasUnansweredQuestion: true }}
      />
    );
    
    // Initially no tooltip
    expect(queryByText('Priority Information')).toBeNull();
    
    // Long press the chat item
    const chatItem = getByText('Other User').parent.parent;
    fireEvent(chatItem, 'onLongPress');
    
    // Tooltip should appear
    expect(getByText('Priority Information')).toBeTruthy();
    expect(getByText('Priority Score: 85/100')).toBeTruthy();
  });

  test('displays AI signals in tooltip', () => {
    const signals = {
      hasUnansweredQuestion: true,
      hasActionItem: true,
      hasUrgentKeywords: true,
    };
    
    const { getByText } = render(
      <ChatListItem
        {...defaultProps}
        priorityScore={90}
        signals={signals}
      />
    );
    
    // Long press to show tooltip
    const chatItem = getByText('Other User').parent.parent;
    fireEvent(chatItem, 'onLongPress');
    
    // Check signals are displayed
    expect(getByText('AI Signals:')).toBeTruthy();
    expect(getByText('Unanswered question')).toBeTruthy();
    expect(getByText('Action item detected')).toBeTruthy();
    expect(getByText('Urgent keywords present')).toBeTruthy();
  });

  test('closes tooltip when tapped', async () => {
    const { getByText, queryByText } = render(
      <ChatListItem
        {...defaultProps}
        priorityScore={85}
      />
    );
    
    // Long press to show tooltip
    const chatItem = getByText('Other User').parent.parent;
    fireEvent(chatItem, 'onLongPress');
    
    // Tooltip should be visible
    expect(getByText('Priority Information')).toBeTruthy();
    
    // Tap to close
    const overlay = getByText('Tap anywhere to close').parent.parent;
    fireEvent.press(overlay);
    
    // Tooltip should close
    await waitFor(() => {
      expect(queryByText('Priority Information')).toBeNull();
    });
  });

  test('does not show tooltip when no priority data is provided', () => {
    const { getByText, queryByText } = render(
      <ChatListItem {...defaultProps} />
    );
    
    // Long press the chat item
    const chatItem = getByText('Other User').parent.parent;
    fireEvent(chatItem, 'onLongPress');
    
    // Tooltip should not appear
    expect(queryByText('Priority Information')).toBeNull();
  });

  test('navigates to chat on regular press', () => {
    const mockPush = jest.fn();
    jest.spyOn(require('expo-router'), 'useRouter').mockReturnValue({
      push: mockPush,
    });
    
    const { getByText } = render(<ChatListItem {...defaultProps} />);
    
    const chatItem = getByText('Other User').parent.parent;
    fireEvent.press(chatItem);
    
    expect(mockPush).toHaveBeenCalledWith('/chat/chat1');
  });

  test('applies bold style to chat name when unread', () => {
    const { getByText } = render(
      <ChatListItem {...defaultProps} isUnread={true} />
    );
    
    const chatName = getByText('Other User');
    expect(chatName.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontWeight: expect.anything() }),
      ])
    );
  });
});

