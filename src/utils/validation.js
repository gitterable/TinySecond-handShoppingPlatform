'use strict';

const validator = require('validator');

/**
 * Input validation helpers. Centralizing these keeps validation rules
 * consistent and makes the security review straightforward.
 */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function validateUsername(username) {
  if (typeof username !== 'string') return '아이디를 입력하세요.';
  if (!USERNAME_RE.test(username)) {
    return '아이디는 영문/숫자/밑줄 3~20자여야 합니다.';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string') return '비밀번호를 입력하세요.';
  if (password.length < 8 || password.length > 72) {
    // 72 is bcrypt's max effective length.
    return '비밀번호는 8~72자여야 합니다.';
  }
  // Require a mix to avoid trivially weak passwords.
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';
  }
  return null;
}

function validateProductName(name) {
  if (typeof name !== 'string') return '상품명을 입력하세요.';
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return '상품명은 1~100자여야 합니다.';
  }
  return null;
}

function validatePrice(priceRaw) {
  // Reject anything that is not a non-negative integer within a sane range.
  if (!validator.isInt(String(priceRaw), { min: 0, max: 1000000000 })) {
    return '가격은 0 이상의 정수여야 합니다.';
  }
  return null;
}

function validateAmount(amountRaw) {
  if (!validator.isInt(String(amountRaw), { min: 1, max: 1000000000 })) {
    return '송금액은 1 이상의 정수여야 합니다.';
  }
  return null;
}

function validateText(text, { max = 500, field = '내용' } = {}) {
  if (typeof text !== 'string') return `${field}을(를) 입력하세요.`;
  if (text.length > max) return `${field}은(는) 최대 ${max}자입니다.`;
  return null;
}

module.exports = {
  validateUsername,
  validatePassword,
  validateProductName,
  validatePrice,
  validateAmount,
  validateText,
};
