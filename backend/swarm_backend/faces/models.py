from django.db import models

class RegisteredFace(models.Model):
    name         = models.CharField(max_length=100)
    descriptor   = models.JSONField()
    photo        = models.ImageField(upload_to='faces/', blank=True, null=True)
    access_count = models.IntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    last_login   = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name


class RobotCommand(models.Model):
    COMMAND_TYPES = [
        ('message', 'Message'),
        ('move', 'Move'),
        ('stop', 'Stop'),
        ('follow', 'Follow'),
        ('formation', 'Formation'),
        ('attack', 'Attack Pattern'),
    ]
    
    robot_id     = models.CharField(max_length=50, null=True, blank=True)  # None means broadcast
    command_type = models.CharField(max_length=20, choices=COMMAND_TYPES, default='message')
    message      = models.TextField()
    created_at   = models.DateTimeField(auto_now_add=True)
    executed     = models.BooleanField(default=False)
    executed_at  = models.DateTimeField(null=True, blank=True)
    
    def __str__(self):
        target = self.robot_id if self.robot_id else 'BROADCAST'
        return f'{self.command_type.upper()} → {target}'