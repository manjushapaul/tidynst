-- Reference data: the initial topic collections. Topics are tags, never primary categories.
INSERT INTO "topics" ("slug", "name", "description") VALUES
  ('no-drill', 'No-drill', 'Storage and organising ideas that need no drilling, such as freestanding, tension, over-the-door and adhesive solutions.'),
  ('renter-friendly', 'Renter-friendly', 'Removable and portable ideas that respect your rental agreement and help protect your deposit.'),
  ('budget', 'Budget', 'Low-cost ways to organise, including making better use of things you already own.'),
  ('space-saving', 'Space-saving', 'Making more room in compact homes with vertical, foldable and multipurpose storage.'),
  ('vertical-storage', 'Vertical storage', 'Using wall height, doors and stacking to free up floor and counter space.'),
  ('decluttering', 'Decluttering', 'Deciding what to keep, and building simple habits that stop clutter from returning.')
ON CONFLICT ("slug") DO NOTHING;
