from ..extensions import db


class RestaurantCalendarSettings(db.Model):
    __tablename__ = 'restaurant_calendar_settings'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer,
        db.ForeignKey('restaurants.id', ondelete='CASCADE'),
        nullable=False,
        unique=True,
    )
    show_public_holidays = db.Column(db.Boolean, nullable=False, default=True)
    show_school_vacations = db.Column(db.Boolean, nullable=False, default=False)
    school_vacation_zone = db.Column(db.String(1), nullable=True)  # 'A' | 'B' | 'C' | None

    restaurant = db.relationship('Restaurant', backref=db.backref('calendar_settings', uselist=False))

    def to_dict(self) -> dict:
        return {
            'show_public_holidays': self.show_public_holidays,
            'show_school_vacations': self.show_school_vacations,
            'school_vacation_zone': self.school_vacation_zone,
        }
