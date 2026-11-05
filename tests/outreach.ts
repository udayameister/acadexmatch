/* College outreach contact extraction: npx tsx tests/outreach.ts */
import assert from 'assert';
import { baseDomain, contactLinks, extractEmails, robotsAllows, deobfuscate } from '../lib/outreach/extract';

const html = '<a href="mailto:principal@abccollege.ac.in?subject=Hi">Mail</a> Contact: info [at] abccollege [dot] ac [dot] in, placement(at)abccollege(dot)ac(dot)in, office&#64;abccollege.ac.in, logo@2x.png, noreply@abccollege.ac.in, webdesign@pixelagency.com, abccollegetvm@gmail.com <script>var a="track@sentry.io"</script>';
const r = extractEmails(html, 'https://www.abccollege.ac.in/contact.html');
assert.deepEqual(r.map(e => e.email).sort(), ['abccollegetvm@gmail.com', 'info@abccollege.ac.in', 'office@abccollege.ac.in', 'placement@abccollege.ac.in', 'principal@abccollege.ac.in']);
assert.equal(r[0].email, 'principal@abccollege.ac.in', 'head of institution ranked first');
assert.equal(deobfuscate('dean at abc dot edu dot in'), 'dean@abc.edu.in');
assert.equal(baseDomain('www.cse.abc.ac.in'), 'abc.ac.in');
assert.equal(baseDomain('abc.edu'), 'abc.edu');
assert.deepEqual(contactLinks('<a href="/contact-us">Contact Us</a><a href="https://other.com/contact">x</a><a href="about.html">About</a><a href="/files/a.pdf">contact pdf</a>', 'https://abc.ac.in/'), ['https://abc.ac.in/contact-us', 'https://abc.ac.in/about.html']);
assert(!robotsAllows('User-agent: *\nDisallow: /', '/contact'));
assert(robotsAllows('User-agent: *\nDisallow: /admin\n', '/contact'));
assert(!robotsAllows('User-agent: AcadeXMatchBot\nDisallow: /\n\nUser-agent: *\nAllow: /', '/'));
assert(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/contact', '/private/contact'));
console.log('outreach: all checks passed');
