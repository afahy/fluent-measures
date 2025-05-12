import { add } from '../src/index.js';
import Benchmark from 'benchmark';

const suite = new Benchmark.Suite();

// Add tests
suite
  .add('add small numbers', () => {
    add(1, 2);
  })
  .add('add large numbers', () => {
    add(999999999, 999999999);
  })
  // add listeners
  .on('cycle', function(this: Benchmark.Suite, event: Benchmark.Event) {
    // eslint-disable-next-line no-console
    console.log(String(event.target));
  })
  .on('complete', function(this: Benchmark.Suite) {
    // eslint-disable-next-line no-console
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  // run async
  .run({ async: true });
