# birabuddy — Privacy Policy and KVKK Disclosure Notice

**Last Updated:** June 2026
**Effective Date:** Upon account registration

This document serves as both our Privacy Policy and our mandatory Disclosure Notice (Aydınlatma Metni) under Turkish Law No. 6698 on the Protection of Personal Data (KVKK).

---

## 1. Data Controller

The data controller responsible for your personal data is:

**Çağlar Yıldırım** (individual operator)
Contact: birabuddy@gmail.com
Location: İstanbul, Turkey

---

## 2. What Data We Collect

### 2.1 At Registration (required)

- **University email address** — must end in .edu or .edu.tr. Used to verify student status and derive your name and university.
- **Name** — derived automatically from your email address (e.g. the part before the @ symbol).
- **University** — derived automatically from your email domain.
- **Instagram username** — used as your visible username on the platform and to allow other users to verify your identity before meetups.
- **Password** — managed entirely by Firebase Authentication. We never store your password.
- **Consent records** — timestamp and version number of your KVKK consent, age confirmation, and terms acceptance.

### 2.2 After Registration (all optional)

- **Profile photos** — up to 5 photos, stored in Firebase Storage.
- **Age** — must be 18 or older if provided.
- **Academic major**
- **Bio** — free text up to 150 characters.
- **Favorite drink**
- **Go-to bar or neighborhood**
- **Vibe tags** — interest categories you select from a fixed list.

### 2.3 When You Use the App

- **Posts** — text, photos (including dual-camera captures), venue tags, and drink logs you choose to share.
- **Comments** — text you write on posts.
- **Room data** — room name, description, city, neighborhood, bar name, date, time, and participant lists for rooms you create or join.
- **Messages** — in-room chat messages and direct messages with friends.
- **Friendship data** — friend requests you send and receive, and your list of accepted friends.
- **"Go Live" status** — an optional note and, if you grant permission, your approximate location (see Section 5).
- **Block records** — records of users you have blocked.
- **Reports** — reports you file against other users or content.
- **Meetup attendance history** — a record of which rooms you participated in, stored in your account for connection statistics.

### 2.4 Technical Data

- **Expo Push Token** — a device identifier used to deliver push notifications.
- **Login timestamps** — the date and time of your last login.

---

## 3. How We Use Your Data

We use your personal data to:

- Create and maintain your account
- Display your profile to other verified users in rooms you join or when they search for you
- Match you with other university students for social meetups
- Enable in-app messaging and friend connections
- Show your "Go Live" status and approximate location to your friends when you activate it
- Send push notifications about room activity, friend requests, meetup prompts, and friend activity
- Enforce community safety through moderation, reporting, and blocking
- Respond to legal requests and comply with Turkish law
- Improve and maintain the technical operation of the platform

---

## 4. Legal Bases for Processing (KVKK Article 5)

| Data | Legal Basis |
|------|-------------|
| Registration data, core account functionality | Performance of the service agreement |
| Profile photos, optional profile fields | Your explicit consent (açık rıza) |
| Location data when going live | Your explicit consent at the time of activation |
| Push notification token | Your explicit consent when granting permission |
| Moderation data, reports, safety records | Legitimate interests of the operator and users |
| Legal retention after account deletion | Legal obligation under Turkish law |
| International data transfers (Firebase, Expo) | Your explicit consent provided at registration |

---

## 5. Location Data

We access your location **only** when you actively tap "Go Live" and have previously granted location permission. At that moment, we:

- Read your GPS coordinates once
- Immediately reduce the precision to approximately 1 kilometer (by rounding coordinates to 2 decimal places)
- Store only this fuzzed, imprecise coordinate — never your exact location
- Share this approximate location with your friends only

We never track your location in the background or continuously. Your location is cleared from our systems when you go offline or at 6:00 AM the following morning. You can withdraw location permission at any time in your device settings.

---

## 6. Push Notifications

We send push notifications for: friend requests and acceptances, room join requests and approvals, room capacity updates, meetup activity prompts, friend post digests, and friends going live. You can disable push notifications at any time in your device settings without affecting your account.

---

## 7. What Other Users Can See About You

When you use birabuddy, the following information is visible to other verified users of the platform:

- Name, university, major, age, bio, profile photos, vibe tags, favorite drink, go-to bar
- Instagram username (tappable link to your Instagram profile)
- "Go Live" status and note when active
- Approximate location when you have chosen to share it while live
- Posts you have made with public visibility
- Posts you have made with friends-only visibility (visible to your friends only)

The following is **never** visible to other users:

- Your email address
- Users you have blocked
- Your moderation or punishment history
- Your consent records and timestamps
- Your push notification token
- Your login timestamps

---

## 8. Third-Party Services

We use the following third-party services. By using birabuddy, you consent to your data being processed by these services as described:

**Firebase (Google LLC, USA)**
We use Firebase Authentication, Cloud Firestore, Firebase Storage, and Firebase Cloud Functions to operate the platform. Your account data, posts, messages, and photos are stored on Firebase servers, which may be located outside Turkey. Google's privacy policy is available at policies.google.com/privacy.

**Expo (Expo Inc., USA)**
We use Expo's push notification service to deliver notifications to your device. Your push notification token passes through Expo's servers before reaching Apple (APNs) or Google (FCM). Expo's privacy policy is available at expo.dev/privacy.

**Apple Maps / Google Maps (via react-native-maps)**
Used to render the live map feature. Map rendering requests are processed by Apple or Google depending on your device platform. No personal location data beyond what is necessary to display the map is shared with these services.

We do not use any analytics, advertising, or behavioral tracking services. No third party receives your data for advertising or profiling purposes.

---

## 9. International Data Transfers

Firebase and Expo servers are located in the United States. By registering and using birabuddy, you explicitly consent to your personal data being transferred to and processed in the United States and potentially other countries outside Turkey. These transfers are made solely for the purpose of operating the service as described in this policy.

---

## 10. Data Retention and Deletion

**While your account is active:** your data is retained for as long as you maintain an account.

**Upon account deletion:**

- Your profile is immediately anonymized (name replaced with "Deleted User", photos removed, bio and personal fields cleared)
- Your posts and comments are immediately hidden from all other users
- A soft-deleted record containing your email, university, consent records, and activity logs is retained for **2 years** for legal compliance, safety, and dispute resolution purposes
- After 2 years, all remaining data is permanently and irreversibly purged from our systems

**Data that is never deleted:**

- Reports filed against you — retained indefinitely regardless of account deletion, to comply with Turkish legal obligations and to protect other users

---

## 11. Your Rights Under KVKK (Article 11)

As a data subject under Turkish Law No. 6698, you have the right to:

a) Learn whether your personal data is being processed
b) Request information about how your data is being processed
c) Learn the purpose of processing and whether it is being used in accordance with that purpose
d) Know which third parties your data has been shared with, domestically or abroad
e) Request correction of incomplete or inaccurate data
f) Request deletion or destruction of your data where the conditions in Article 7 are met
g) Request that any corrections or deletions be notified to third parties to whom your data was previously disclosed
h) Object to outcomes that are produced exclusively by automated processing and that are to your detriment
i) Claim compensation for any damages suffered as a result of unlawful processing of your data

To exercise any of these rights, contact us at **birabuddy@gmail.com** with your request. We will respond within 30 days. There is no fee for most requests.

---

## 12. Children

birabuddy is strictly for users aged 18 and over. We do not knowingly collect data from anyone under 18. If you believe a minor has registered, contact us immediately at birabuddy@gmail.com and we will take immediate action.

---

## 13. Data Security

We rely on Firebase's security infrastructure, which includes encryption in transit and at rest, access controls, and regular security updates. However, no system is entirely secure and we cannot guarantee absolute protection. You are responsible for keeping your account credentials confidential.

---

## 14. Changes to This Policy

We may update this policy when our data practices change. We will notify you of significant changes through the app before they take effect. The "Last Updated" date at the top of this document always reflects the current version. Continued use of birabuddy after changes take effect constitutes acceptance of the updated policy.

---

## 15. Contact

For all privacy-related requests, questions, or complaints:

**Çağlar Yıldırım**
birabuddy@gmail.com
İstanbul, Turkey
