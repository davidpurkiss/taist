/**
 * Simple script to test the Calculator
 */
import { Calculator } from './calculator.js';

const calc = new Calculator();

console.log('Testing Calculator:');
console.log('2 + 3 =', calc.add(2, 3));
console.log('5 - 2 =', calc.subtract(5, 2));
console.log('3 * 4 =', calc.multiply(3, 4));
console.log('10 / 2 =', calc.divide(10, 2));
console.log('2 ^ 8 =', calc.power(2, 8));
console.log('5! =', calc.factorial(5));
