// Preloaded with `node -r`: fixes "now" to FAKE_NOW so two code versions see the same clock.
const fixedNow = Date.parse(process.env.FAKE_NOW || '');
if (Number.isNaN(fixedNow)) {
  throw new Error('FAKE_NOW must be an ISO timestamp');
}

const RealDate = Date;

class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(fixedNow);
    } else {
      super(...args);
    }
  }

  static now() {
    return fixedNow;
  }
}

FakeDate.parse = RealDate.parse;
FakeDate.UTC = RealDate.UTC;
global.Date = FakeDate;
