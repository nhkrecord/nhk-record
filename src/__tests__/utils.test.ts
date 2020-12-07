import { parseDate } from '../utils';

describe('utils', () => {
  describe('parseDate', () => {
    it('should convert epoch string to equivalent Date', () => {
      const result = parseDate('1605657599999');
      expect(result).toEqual(new Date('2020-11-17T23:59:59.999Z'));
    });
  });
});
