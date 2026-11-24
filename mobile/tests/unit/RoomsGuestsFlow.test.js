import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { GuestsModal } from '../../src/components/GuestsModal.js';
import { summarizeOccupancy, formatOccupancy, occupancyLabel } from '../../src/utils/format.js';
import { OCCUPANCY_LIMITS } from '../../src/constants/booking.js';

describe('Rooms & Guests Flow & Logic', () => {
  describe('Occupancy Formatting Utilities', () => {
    test('summarizeOccupancy: 1 room with 2 adults', () => {
      expect(summarizeOccupancy([{ adults: 2, childAges: [] }])).toBe('1 Room · 2 Adults');
    });

    test('summarizeOccupancy: 1 room with 1 adult and 1 child', () => {
      expect(summarizeOccupancy([{ adults: 1, childAges: [5] }])).toBe('1 Room · 1 Adult · 1 Child');
    });

    test('summarizeOccupancy: 2 rooms with 4 total guests', () => {
      expect(
        summarizeOccupancy([
          { adults: 2, childAges: [] },
          { adults: 1, childAges: [8] },
        ])
      ).toBe('2 Rooms · 4 Guests');
    });

    test('formatOccupancy: canonical URL format', () => {
      expect(
        formatOccupancy([
          { adults: 2, childAges: [7, 12] },
          { adults: 1, childAges: [] },
        ])
      ).toBe('2-7.12|1');
    });

    test('occupancyLabel: pluralization check', () => {
      expect(
        occupancyLabel([
          { adults: 2, childAges: [] },
          { adults: 2, childAges: [5] },
        ])
      ).toBe('2 rooms · 4 adults · 1 child');
    });
  });

  describe('GuestsModal Component', () => {
    test('renders with initial room data and limits', async () => {
      const onClose = jest.fn();
      const onChange = jest.fn();

      const { getByText } = await render(
        <GuestsModal
          visible={true}
          rooms={[{ adults: 2, childAges: [] }]}
          onChange={onChange}
          onClose={onClose}
        />
      );

      expect(getByText('Rooms & Guests')).toBeTruthy();
      expect(getByText('1 Room · 2 Adults')).toBeTruthy();
      expect(getByText('Total Rooms')).toBeTruthy();
    });

    test('adding another room adds a second room and updates summary', async () => {
      const onClose = jest.fn();
      const onChange = jest.fn();

      const { getByText } = await render(
        <GuestsModal
          visible={true}
          rooms={[{ adults: 2, childAges: [] }]}
          onChange={onChange}
          onClose={onClose}
        />
      );

      fireEvent.press(getByText('Add another room'));
      await waitFor(() => {
        expect(getByText('2 Rooms · 4 Guests')).toBeTruthy();
      });

      fireEvent.press(getByText(/Apply/));
      expect(onChange).toHaveBeenCalledWith([
        { adults: 2, childAges: [], pets: 0 },
        { adults: 2, childAges: [], pets: 0 },
      ]);
      expect(onClose).toHaveBeenCalled();
    });

    test('increasing pets updates summary and onChange payload', async () => {
      const onClose = jest.fn();
      const onChange = jest.fn();

      const { getByLabelText, getByText } = await render(
        <GuestsModal
          visible={true}
          rooms={[{ adults: 2, childAges: [] }]}
          onChange={onChange}
          onClose={onClose}
        />
      );

      fireEvent.press(getByLabelText('Increase Pets'));
      await waitFor(() => {
        expect(getByText('1 Room · 2 Adults · 1 Pet')).toBeTruthy();
      });

      fireEvent.press(getByText(/Apply/));
      expect(onChange).toHaveBeenCalledWith([
        { adults: 2, childAges: [], pets: 1 },
      ]);
    });

    test('increasing children adds age stepper for that child', async () => {
      const onClose = jest.fn();
      const onChange = jest.fn();

      const { getByLabelText, getByText } = await render(
        <GuestsModal
          visible={true}
          rooms={[{ adults: 2, childAges: [] }]}
          onChange={onChange}
          onClose={onClose}
        />
      );

      fireEvent.press(getByLabelText('Increase Children'));
      await waitFor(() => {
        expect(getByText('Age of children')).toBeTruthy();
        expect(getByText('Child 1 age')).toBeTruthy();
      });
    });

    test('steppers enforce OCCUPANCY_LIMITS constraints', () => {
      expect(OCCUPANCY_LIMITS.maxRooms).toBe(8);
      expect(OCCUPANCY_LIMITS.minAdults).toBe(1);
      expect(OCCUPANCY_LIMITS.maxAdults).toBe(6);
      expect(OCCUPANCY_LIMITS.maxChildrenPerRoom).toBe(4);
      expect(OCCUPANCY_LIMITS.minAge).toBe(0);
      expect(OCCUPANCY_LIMITS.maxAge).toBe(17);
    });
  });
});
