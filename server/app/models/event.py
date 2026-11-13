from ..extensions import db
from ..utils.time import utc_now_naive


class Event(db.Model):
    __tablename__ = 'events'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)

    title = db.Column(db.String(100), nullable=False)
    subtitle = db.Column(db.String(200), nullable=True)
    # Sanitised on write (services/rich_text); rows predating the rich text
    # editor still hold Markdown.
    description = db.Column(db.Text, nullable=True)
    color = db.Column(db.String(7), nullable=True, default='#3498DB')  # Hex (#RRGGBB)

    event_date = db.Column(db.Date, nullable=True, index=True)
    status = db.Column(db.String(20), default='draft')  # draft, published
    visibility = db.Column(db.String(20), default='all')  # tv, mobile, all
    pinned = db.Column(db.Boolean, nullable=False, default=False, server_default='false')
    published_at = db.Column(db.DateTime(timezone=True), nullable=True)

    notified_7d = db.Column(db.Boolean, default=False, nullable=False)
    notified_1d = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=utc_now_naive)
    updated_at = db.Column(db.DateTime, default=utc_now_naive, onupdate=utc_now_naive)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    created_by = db.relationship('User', backref='created_events', foreign_keys=[created_by_id])
    images = db.relationship(
        'EventImage', backref='event', lazy='dynamic',
        cascade='all, delete-orphan', order_by='EventImage.order',
    )

    VALID_VISIBILITY = ['tv', 'mobile', 'all']
    VALID_STATUS = ['draft', 'published']

    def __repr__(self):
        return f'<Event {self.event_date}: {self.title}>'


class EventImage(db.Model):
    __tablename__ = 'event_images'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    storage_key = db.Column(db.String(500), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    filename = db.Column(db.String(255), nullable=True)  # As uploaded
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utc_now_naive)

    def __repr__(self):
        return f'<EventImage {self.id} for Event {self.event_id}>'
