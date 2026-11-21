import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { WriteReviewModal } from '../../src/components/WriteReviewModal.js';

jest.setTimeout(25000);

jest.mock('../../src/api/reviewsApi.js', () => ({
  reviewsApi: {
    eligibility: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

import { reviewsApi } from '../../src/api/reviewsApi.js';

const TIMEOUT = { timeout: 7000 };

describe('WriteReviewModal', () => {
  beforeAll(() => {
    jest.spyOn(Animated, 'spring').mockReturnValue({ start: (cb) => cb && cb({ finished: true }) });
    jest.spyOn(Animated, 'timing').mockReturnValue({ start: (cb) => cb && cb({ finished: true }) });
  });

  afterAll(() => {
    Animated.spring.mockRestore?.();
    Animated.timing.mockRestore?.();
  });

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('checks eligibility and renders review form when eligible', async () => {
    reviewsApi.eligibility.mockResolvedValue({ eligible: true, reason: null });

    const { getByText, getByPlaceholderText } = await render(
      <WriteReviewModal
        visible={true}
        bookingId={101}
        hotelName="Seaside Resort"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(getByText('Submit review')).toBeTruthy(), TIMEOUT);
    expect(getByText('Write a review')).toBeTruthy();
    expect(getByText('Seaside Resort')).toBeTruthy();
    expect(getByPlaceholderText('Summarise your stay in one line')).toBeTruthy();
    expect(getByPlaceholderText('Tell other travelers about your stay (at least 10 characters)')).toBeTruthy();
  });

  test('shows validation error when body has less than 10 characters', async () => {
    reviewsApi.eligibility.mockResolvedValue({ eligible: true, reason: null });

    const { getByText, getByPlaceholderText } = await render(
      <WriteReviewModal
        visible={true}
        bookingId={102}
        hotelName="Seaside Resort"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(getByText('Submit review')).toBeTruthy(), TIMEOUT);

    const bodyInput = getByPlaceholderText('Tell other travelers about your stay (at least 10 characters)');
    fireEvent.changeText(bodyInput, 'Too short');
    await waitFor(() => expect(bodyInput.props.value).toBe('Too short'), TIMEOUT);

    fireEvent.press(getByText('Submit review'));
    await waitFor(() => expect(getByText('Say a little more about your stay (at least 10 characters).')).toBeTruthy(), TIMEOUT);
    expect(reviewsApi.create).not.toHaveBeenCalled();
  });

  test('successfully submits a valid review and shows success message', async () => {
    reviewsApi.eligibility.mockResolvedValue({ eligible: true, reason: null });
    reviewsApi.create.mockResolvedValue({ id: 50, rating: 5, body: 'Fantastic stay, friendly staff and clean rooms.' });

    const onSubmitted = jest.fn();
    const { getByText, getByPlaceholderText } = await render(
      <WriteReviewModal
        visible={true}
        bookingId={103}
        hotelName="Seaside Resort"
        onClose={jest.fn()}
        onSubmitted={onSubmitted}
      />
    );

    await waitFor(() => expect(getByText('Submit review')).toBeTruthy(), TIMEOUT);

    const titleInput = getByPlaceholderText('Summarise your stay in one line');
    const bodyInput = getByPlaceholderText('Tell other travelers about your stay (at least 10 characters)');

    fireEvent.changeText(titleInput, 'Amazing weekend');
    fireEvent.changeText(bodyInput, 'Fantastic stay, friendly staff and clean rooms.');
    await waitFor(() => expect(bodyInput.props.value).toBe('Fantastic stay, friendly staff and clean rooms.'), TIMEOUT);

    fireEvent.press(getByText('Submit review'));

    await waitFor(
      () =>
        expect(reviewsApi.create).toHaveBeenCalledWith({
          bookingId: 103,
          rating: 5,
          title: 'Amazing weekend',
          body: 'Fantastic stay, friendly staff and clean rooms.',
        }),
      TIMEOUT
    );
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled(), TIMEOUT);
    await waitFor(() => expect(getByText('Review submitted!')).toBeTruthy(), TIMEOUT);
  });

  test('pre-fills existing review and updates when in edit mode', async () => {
    reviewsApi.eligibility.mockResolvedValue({
      eligible: false,
      reason: 'ALREADY_REVIEWED',
      review: {
        id: 77,
        rating: 4,
        title: 'Initial review',
        body: 'Good experience, but the breakfast could be improved.',
      },
    });
    reviewsApi.update.mockResolvedValue({ id: 77, rating: 4 });

    const { getByText, getByDisplayValue, debug } = await render(
      <WriteReviewModal
        visible={true}
        bookingId={104}
        hotelName="Seaside Resort"
        onClose={jest.fn()}
      />
    );

    try {
      await waitFor(() => expect(getByText('Update review')).toBeTruthy(), { timeout: 3000 });
    } catch (e) {
      debug();
      throw e;
    }
    expect(getByText('Edit your review')).toBeTruthy();
    expect(getByDisplayValue('Initial review')).toBeTruthy();
    expect(getByDisplayValue('Good experience, but the breakfast could be improved.')).toBeTruthy();

    fireEvent.press(getByText('Update review'));

    await waitFor(
      () =>
        expect(reviewsApi.update).toHaveBeenCalledWith(77, {
          rating: 4,
          title: 'Initial review',
          body: 'Good experience, but the breakfast could be improved.',
        }),
      TIMEOUT
    );
  });

  test('shows ineligible message when stay is not completed', async () => {
    reviewsApi.eligibility.mockResolvedValue({
      eligible: false,
      reason: 'NOT_COMPLETED',
    });

    const { getByText } = await render(
      <WriteReviewModal
        visible={true}
        bookingId={105}
        hotelName="Seaside Resort"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(getByText('Not eligible yet')).toBeTruthy(), TIMEOUT);
    expect(getByText('You can review a hotel after your stay is complete.')).toBeTruthy();
  });
});
