import {
  bestPassages,
  orTsQuery,
  questionTerms,
  unaccent,
} from './ai-retrieval';

describe('questionTerms', () => {
  it('keeps meaningful words, accent-free and deduplicated', () => {
    expect(
      questionTerms('Quy trình nghỉ phép là gì? Nghỉ phép bao lâu?'),
    ).toEqual(['quy', 'trinh', 'nghi', 'phep', 'lau']);
  });

  it('drops English stop words and punctuation', () => {
    expect(questionTerms('What is the VPN setup, please?')).toEqual([
      'vpn',
      'setup',
    ]);
  });

  it('cannot inject tsquery syntax', () => {
    const terms = questionTerms("a & b | c:* ! 'x' (y)");
    expect(orTsQuery(terms)).toBeNull();
    expect(questionTerms('drop:*|table')).toEqual(['drop', 'table']);
  });
});

describe('orTsQuery', () => {
  it('ORs prefix terms', () => {
    expect(orTsQuery(['nghi', 'phep'])).toBe('nghi:* | phep:*');
    expect(orTsQuery([])).toBeNull();
  });
});

describe('unaccent', () => {
  it('strips Vietnamese diacritics', () => {
    expect(unaccent('Đường đi Hà Nội')).toBe('duong di ha noi');
  });
});

describe('bestPassages', () => {
  const text = [
    'Giới thiệu công ty.',
    'Quy trình nghỉ phép: gửi đơn cho quản lý trước 3 ngày.',
    'Chính sách bảo hiểm.',
    'Nghỉ phép năm tối đa 12 ngày.',
  ].join('\n');

  it('keeps the matching paragraphs in document order', () => {
    expect(bestPassages(text, ['nghi', 'phep'], 1000)).toBe(
      'Quy trình nghỉ phép: gửi đơn cho quản lý trước 3 ngày.\nNghỉ phép năm tối đa 12 ngày.',
    );
  });

  it('respects the budget', () => {
    expect(bestPassages(text, ['nghi'], 20).length).toBeLessThanOrEqual(20);
  });

  it('falls back to the start when nothing matches', () => {
    expect(bestPassages(text, ['zzz'], 1000)).toBe('Giới thiệu công ty.');
  });
});
