
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from .models import EmployeeProfile


class LoginSerializer(serializers.Serializer):
    employee_id = serializers.CharField()
    portal = serializers.ChoiceField(
        choices=["ADMIN", "STAFF"],
        required=False,
    )
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )


class PasswordResetRequestSerializer(serializers.Serializer):
    employee_id = serializers.CharField(max_length=30)
    portal = serializers.ChoiceField(choices=["ADMIN", "STAFF"])

    def validate_employee_id(self, value):
        return value.strip()


class PasswordResetConfirmSerializer(serializers.Serializer):
    employee_id = serializers.CharField(max_length=30)
    portal = serializers.ChoiceField(choices=["ADMIN", "STAFF"])
    approval_code = serializers.RegexField(r"^\d{8}$")
    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_employee_id(self, value):
        return value.strip()


class StaffCreateSerializer(serializers.Serializer):
    employee_id = serializers.CharField(max_length=30)
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    mobile_number = serializers.CharField(max_length=20)
    department = serializers.CharField(max_length=100, required=False, allow_blank=True)
    job_title = serializers.CharField(max_length=100, required=False, allow_blank=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_employee_id(self, value):
        value = value.strip()
        user_model = get_user_model()
        if EmployeeProfile.objects.filter(employee_id__iexact=value).exists():
            raise serializers.ValidationError("This employee ID is already in use.")
        if user_model.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This employee ID conflicts with an existing username.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except ValidationError as error:
            raise serializers.ValidationError(list(error.messages)) from error
        return value


class StaffProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(
        source="user.email",
        required=False,
        allow_blank=True,
    )
    is_active = serializers.BooleanField(source="user.is_active", required=False)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = EmployeeProfile
        fields = [
            "id",
            "employee_id",
            "full_name",
            "email",
            "mobile_number",
            "department",
            "job_title",
            "start_date",
            "role",
            "is_active",
            "username",
        ]
        read_only_fields = ["id", "employee_id", "role", "username"]

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        user = instance.user
        for field, value in user_data.items():
            setattr(user, field, value)
        if user_data:
            user.save(update_fields=list(user_data))

        return instance
