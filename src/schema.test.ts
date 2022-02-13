import { S } from './schema';

describe('NodeSchema', () => {
  it('should be able to define properties', () => {
    const layout = S.object();

    layout //
      .setName('Layout')
      .defineProperty('children', S.array(layout))
      .defineProperty('name', S.object());
  });
});
