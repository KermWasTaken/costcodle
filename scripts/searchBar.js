/*
Copyright (c) 2023 by Wade Williams (https://codepen.io/559wade/pen/LRzEjj)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

function formatNumber(n) {
  // format number 1000000 to 1,234,567
  return n.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Formats a raw currency <input> (Classic + Checkout). */
function formatCurrency(input, blur) {
  var el = input;
  if (!el) return;

  var input_val = el.value;

  // don't validate empty input
  if (input_val === "") {
    return;
  }

  // original length
  var original_len = input_val.length;

  // initial caret position
  var caret_pos = el.selectionStart;

  // check for decimal
  if (input_val.indexOf(".") >= 0) {
    var decimal_pos = input_val.indexOf(".");
    var left_side = input_val.substring(0, decimal_pos);
    var right_side = input_val.substring(decimal_pos);

    left_side = formatNumber(left_side);
    right_side = formatNumber(right_side);

    if (blur === "blur") {
      right_side += "00";
    }

    right_side = right_side.substring(0, 2);
    input_val = left_side + "." + right_side;
  } else {
    input_val = formatNumber(input_val);

    if (blur === "blur") {
      input_val += ".00";
    }
  }

  el.value = input_val;

  var updated_len = input_val.length;
  caret_pos = updated_len - original_len + caret_pos;
  el.setSelectionRange(caret_pos, caret_pos);
}

function isCurrencyInput(target) {
  return (
    target &&
    target.tagName === "INPUT" &&
    target.getAttribute("data-type") === "currency"
  );
}

// Vanilla delegation — works for Classic's static field and Checkout's re-rendered ones.
document.addEventListener("keyup", function (event) {
  if (!isCurrencyInput(event.target)) return;
  formatCurrency(event.target);
});

document.addEventListener(
  "blur",
  function (event) {
    if (!isCurrencyInput(event.target)) return;
    formatCurrency(event.target, "blur");
  },
  true
);
