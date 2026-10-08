import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, Min, ValidateNested, validate } from 'class-validator';
import { flattenValidationErrors } from '../../../src/common/exceptions/validation-failed.exception.js';

class Address {
  @IsString() city!: string;
}
class Dto {
  @IsEmail() email!: string;
  @IsInt() @Min(1) quantity!: number;
  @ValidateNested() @Type(() => Address) address!: Address;
}

describe('flattenValidationErrors', () => {
  it('flattens nested errors into dotted field paths', async () => {
    const dto = Object.assign(new Dto(), {
      email: 'nope',
      quantity: 0,
      address: Object.assign(new Address(), { city: 5 }),
    });
    const flat = flattenValidationErrors(await validate(dto));
    const byField = Object.fromEntries(flat.map((v) => [v.field, v.errors]));
    expect(Object.keys(byField).sort()).toEqual(['address.city', 'email', 'quantity']);
    expect(byField['quantity']).toEqual(['quantity must not be less than 1']);
  });

  it('returns an empty list when there are no errors', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});
