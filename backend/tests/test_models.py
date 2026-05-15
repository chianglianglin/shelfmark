from sqlalchemy import create_engine, inspect as sa_inspect
from sqlalchemy.orm import sessionmaker
from database import Base
import models


def test_tables_created():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        table_names = sa_inspect(conn).get_table_names()
    assert "documents" in table_names
    assert "highlights" in table_names
    assert "tags" in table_names
    assert "document_tags" in table_names
    assert "users" in table_names
